import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import type { Express } from "express";
import type { Connection } from "mongoose";
import { connectDatabase, type Models } from "../src/models.js";
import { seedDatabase, extractSkills } from "../src/services.js";
import { createApp } from "../src/app.js";
import {
  normalizeEvidence,
  observeEvidence,
  type ImageStorage,
} from "../src/evidence.js";
import {
  rubric,
  calculatePractical,
  calculateFinal,
  suggestedRecommendation,
} from "../../shared/assessment.js";
import { questions } from "../src/questions.js";
import { qualification } from "../../shared/data.js";

const databaseName = `dakshsetu_test_${randomUUID().replaceAll("-", "")}`;
let connection: Connection,
  db: Models,
  app: Express,
  image: Buffer,
  assessorToken: string,
  otherToken: string;
let uploads = 0,
  removed = 0;
const storage: ImageStorage = {
  configured: true,
  async upload(_image, id) {
    uploads++;
    return {
      url: `https://res.cloudinary.com/test/image/authenticated/v1/${id}.jpg`,
      publicId: id,
    };
  },
  async remove() {
    removed++;
  },
};
const observation = {
  observations: rubric.map((r) => ({
    criterionId: r.id,
    status: "unclear",
    confidence: 0.9,
  })),
  warnings: ["Image cannot demonstrate isolation or live testing."],
  suggestedScore: 4,
  maxScore: 10,
  summary: "A single image supports only limited observations.",
  limitations: ["The complete procedure is not visible."],
};
const fakeFetch: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify(observation) }] } },
      ],
    }),
  );
const config = {
  jwtSecret: "phase6-test-secret-not-a-real-credential",
  clientUrls: [],
  test: true,
  ai: { apiKey: "test-key", model: "test-model", fetcher: fakeFetch },
  imageStorage: storage,
};
before(async () => {
  ({ connection, models: db } = await connectDatabase(
    `mongodb://127.0.0.1:27027/${databaseName}`,
  ));
  await seedDatabase(db);
  app = createApp(db, config);
  image = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#dbe7f6" },
  })
    .png()
    .toBuffer();
  assessorToken = (
    await request(app)
      .post("/api/auth/login")
      .send({ email: "assessor@dakshsetu.demo", password: "demo123" })
      .expect(200)
  ).body.token;
  const original = await db.User.findOne({ email: "assessor@dakshsetu.demo" })
    .select("+passwordHash")
    .lean();
  const now = new Date().toISOString();
  await db.User.create({
    id: randomUUID(),
    name: "Second Test Assessor",
    email: "second-assessor@example.test",
    phone: "9876543210",
    passwordHash: original!.passwordHash,
    role: "assessor",
    preferredLanguage: "en",
    createdAt: now,
    updatedAt: now,
  });
  otherToken = (
    await request(app)
      .post("/api/auth/login")
      .send({ email: "second-assessor@example.test", password: "demo123" })
      .expect(200)
  ).body.token;
});
after(async () => {
  if (connection) {
    assert.equal(connection.name, databaseName);
    assert.match(connection.name, /^dakshsetu_test_[a-f0-9]+$/);
    await connection.dropDatabase();
    await connection.close();
  }
});
const auth = () => ({ Authorization: "Bearer " + assessorToken });
async function worker() {
  const registration = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Synthetic Assessment Worker",
      email: `${randomUUID()}@example.test`,
      password: "testpass123",
      phone: "9876543210",
      preferredLanguage: "en",
    })
    .expect(201);
  const headers = { Authorization: "Bearer " + registration.body.token };
  await request(app)
    .post("/api/workers/experience")
    .set(headers)
    .send({
      experienceDescription:
        "I do house wiring, install MCBs and switches, test circuits and repair faults.",
      trade: "Electrician",
      yearsExperience: 8,
    })
    .expect(200);
  await request(app)
    .put("/api/workers/skills")
    .set(headers)
    .send({ skills: qualification.skills })
    .expect(200);
  await request(app).post("/api/qualifications/match").set(headers).expect(200);
  const a = await request(app)
    .post("/api/self-assessment/submit")
    .set(headers)
    .send({
      responses: questions.map((q, i) => ({
        questionId: q.id,
        answer: i === 4 ? 1 : q.correctAnswer,
      })),
    })
    .expect(201);
  return {
    user: registration.body.user,
    token: registration.body.token,
    assessment: a.body,
  };
}
async function claimed() {
  const w = await worker();
  const r = await request(app)
    .post("/api/assessments")
    .set(auth())
    .send({ workerId: w.user.id })
    .expect(201);
  return { ...w, assessment: r.body };
}
const allScores = rubric.map((r) => ({
  criterionId: r.id,
  score: 3,
  remark: "Synthetic practical test observation.",
}));
async function scored() {
  const w = await claimed();
  w.assessment = (
    await request(app)
      .put(`/api/assessments/${w.assessment.id}/practical`)
      .set(auth())
      .send({ baseVersion: w.assessment.version, rubricScores: allScores })
      .expect(200)
  ).body;
  return w;
}
async function evidence(w: Awaited<ReturnType<typeof claimed>>) {
  const uploadId = randomUUID();
  const r = await request(app)
    .post(`/api/assessments/${w.assessment.id}/evidence`)
    .set(auth())
    .field("baseVersion", String(w.assessment.version))
    .field("uploadId", uploadId)
    .attach("image", image, {
      filename: "synthetic-board.png",
      contentType: "image/png",
    })
    .expect(201);
  w.assessment = r.body.assessment;
  return { uploadId, evidence: r.body.evidence };
}

test("Phase 6: assessor-only candidate list and details come from stored worker data", async () => {
  const w = await worker();
  await request(app).get("/api/assessor/candidates").expect(401);
  await request(app)
    .get("/api/assessor/candidates")
    .auth(w.token, { type: "bearer" })
    .expect(403);
  const list = await request(app)
    .get("/api/assessor/candidates")
    .set(auth())
    .expect(200);
  assert.ok(
    list.body.some((c: { user: { id: string } }) => c.user.id === w.user.id),
  );
  assert.ok(
    list.body.every(
      (c: { user: { passwordHash?: string } }) => !c.user.passwordHash,
    ),
  );
  const c = await request(app)
    .get("/api/assessor/candidates/" + w.user.id)
    .set(auth())
    .expect(200);
  assert.equal(c.body.assessment.selfAssessmentScore, 80);
  assert.equal(c.body.qualification.isDemo, true);
  assert.equal(c.body.profile.trade, "Electrician");
});
test("Phase 6: claim is exclusive and competing assessors cannot read or edit assigned work", async () => {
  const w = await claimed();
  const other = { Authorization: "Bearer " + otherToken };
  await request(app)
    .post("/api/assessments")
    .set(other)
    .send({ workerId: w.user.id })
    .expect(409);
  await request(app)
    .get("/api/assessor/candidates/" + w.user.id)
    .set(other)
    .expect(404);
  await request(app)
    .get("/api/assessments/" + w.assessment.id)
    .set(other)
    .expect(403);
  await request(app)
    .put(`/api/assessments/${w.assessment.id}/practical`)
    .set(other)
    .send({ baseVersion: w.assessment.version, rubricScores: allScores })
    .expect(403);
  const same = await request(app)
    .post("/api/assessments")
    .set(auth())
    .send({ workerId: w.user.id })
    .expect(200);
  assert.equal(same.body.version, w.assessment.version);
});
test("Phase 7: weights, partial drafts, zero scores and saved remarks are persisted", async () => {
  assert.equal(
    rubric.reduce((sum, r) => sum + r.weight, 0),
    100,
  );
  assert.equal(calculatePractical(allScores), 100);
  assert.equal(
    calculatePractical(allScores.map((r) => ({ ...r, score: 0 }))),
    0,
  );
  assert.equal(
    calculatePractical([{ criterionId: "power", score: 3, remark: "" }]),
    15,
  );
  const w = await claimed();
  const saved = await request(app)
    .put(`/api/assessments/${w.assessment.id}/practical`)
    .set(auth())
    .send({
      baseVersion: w.assessment.version,
      rubricScores: [
        {
          criterionId: "power",
          score: 0,
          remark: "Not demonstrated in this test.",
        },
      ],
    })
    .expect(200);
  assert.equal(saved.body.practicalScore, 0);
  const persisted = await db.Assessment.findOne({ id: w.assessment.id }).lean();
  assert.equal(
    persisted!.practical!.rubricScores[0].remark,
    "Not demonstrated in this test.",
  );
  assert.equal(saved.body.version, w.assessment.version + 1);
});
test("Phase 7: stale versions, repeated criteria and invalid scores are rejected", async () => {
  const w = await scored();
  const path = `/api/assessments/${w.assessment.id}/practical`;
  await request(app)
    .put(path)
    .set(auth())
    .send({ baseVersion: 0, rubricScores: allScores })
    .expect(409);
  await request(app)
    .put(path)
    .set(auth())
    .send({
      baseVersion: w.assessment.version,
      rubricScores: [allScores[0], allScores[0]],
    })
    .expect(400);
  await request(app)
    .put(path)
    .set(auth())
    .send({
      baseVersion: w.assessment.version,
      rubricScores: [{ criterionId: "power", score: 4 }],
    })
    .expect(400);
});
test("Phase 8: evidence is decoded, uploaded, privately previewed, and not duplicated on retry", async () => {
  const w = await claimed(),
    before = uploads;
  const e = await evidence(w);
  assert.equal(uploads, before + 1);
  assert.equal(e.evidence.imageData, undefined);
  assert.equal(e.evidence.mimeType, "image/jpeg");
  assert.equal(e.evidence.originalHash.length, 64);
  const retry = await request(app)
    .post(`/api/assessments/${w.assessment.id}/evidence`)
    .set(auth())
    .field("baseVersion", "0")
    .field("uploadId", e.uploadId)
    .attach("image", image, { filename: "retry.png", contentType: "image/png" })
    .expect(200);
  assert.equal(retry.body.evidence.id, e.uploadId);
  assert.equal(uploads, before + 1);
  await request(app)
    .get(`/api/assessments/${w.assessment.id}/evidence/${e.uploadId}/content`)
    .expect(401);
  const content = await request(app)
    .get(`/api/assessments/${w.assessment.id}/evidence/${e.uploadId}/content`)
    .set(auth())
    .expect(200);
  assert.match(content.headers["content-type"], /image\/jpeg/);
  assert.ok(Buffer.isBuffer(content.body));
  assert.equal(content.body[0], 0xff);
  await request(app)
    .get(`/api/assessments/${w.assessment.id}/evidence/${e.uploadId}/content`)
    .auth(otherToken, { type: "bearer" })
    .expect(403);
  const c = await request(app)
    .get("/api/assessor/candidates/" + w.user.id)
    .set(auth())
    .expect(200);
  assert.equal(c.body.evidence[0].imageData, undefined);
});
test("Phase 8: wrong types, forged images, oversize uploads and missing storage fail visibly", async () => {
  const w = await claimed();
  const path = `/api/assessments/${w.assessment.id}/evidence`;
  const attempt = (bytes: Buffer, mime: string) =>
    request(app)
      .post(path)
      .set(auth())
      .field("baseVersion", String(w.assessment.version))
      .field("uploadId", randomUUID())
      .attach("image", bytes, { filename: "image.png", contentType: mime });
  await attempt(Buffer.from("<script>bad</script>"), "text/html").expect(415);
  await attempt(Buffer.from("not an image"), "image/png").expect(415);
  await attempt(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png").expect(413);
  await attempt(image, "image/jpeg").expect(415);
  const noStorage = createApp(db, { ...config, imageStorage: undefined });
  const r = await request(noStorage)
    .post(path)
    .set(auth())
    .field("baseVersion", String(w.assessment.version))
    .field("uploadId", randomUUID())
    .attach("image", image, { filename: "image.png", contentType: "image/png" })
    .expect(503);
  assert.equal(r.body.code, "STORAGE_UNAVAILABLE");
  assert.equal(
    (await db.Assessment.findOne({ id: w.assessment.id }).lean())!.evidenceIds
      .length,
    0,
  );
});
test("Phase 8: normalization strips metadata and rejects large decoded images", async () => {
  const source = await sharp(image).withMetadata().jpeg().toBuffer();
  const normalized = await normalizeEvidence(source, "image/jpeg");
  const info = await sharp(normalized.bytes).metadata();
  assert.equal(info.format, "jpeg");
  assert.equal(info.exif, undefined);
  const tooManyPixels = await sharp({
    create: { width: 5000, height: 4000, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  await assert.rejects(normalizeEvidence(tooManyPixels, "image/png"));
});
test("Phase 9: visible-only observations are validated, stored, and tied to an uploaded image", async () => {
  const w = await scored(),
    e = await evidence(w);
  const r = await request(app)
    .post("/api/ai/analyze-evidence")
    .set(auth())
    .send({
      assessmentId: w.assessment.id,
      evidenceId: e.uploadId,
      baseVersion: w.assessment.version,
    })
    .expect(200);
  assert.equal(r.body.aiObservation.observations.length, rubric.length);
  assert.equal(r.body.aiObservation.maxScore, 10);
  assert.equal(r.body.aiSuggestedScore, 40);
  assert.equal(r.body.aiObservation.evidenceId, e.uploadId);
  assert.ok(
    r.body.aiObservation.limitations.some((l: string) =>
      l.includes("single image"),
    ),
  );
  await request(app)
    .post("/api/ai/analyze-evidence")
    .set(auth())
    .send({
      assessmentId: w.assessment.id,
      evidenceId: randomUUID(),
      baseVersion: r.body.version,
    })
    .expect(404);
  await request(app)
    .post("/api/ai/analyze-evidence")
    .set(auth())
    .send({
      assessmentId: w.assessment.id,
      evidenceId: e.uploadId,
      baseVersion: r.body.version,
      imageUrl: "http://127.0.0.1/private",
    })
    .expect(400);
});
test("Phase 9: missing or malformed AI cannot manufacture an observation", async () => {
  await assert.rejects(observeEvidence(image, randomUUID(), { model: "test" }));
  await assert.rejects(
    observeEvidence(image, randomUUID(), {
      apiKey: "test",
      model: "test",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "not-json" }] } }],
          }),
        ),
    }),
  );
  const w = await scored(),
    e = await evidence(w);
  const noAI = createApp(db, { ...config, ai: { model: "test" } });
  await request(noAI)
    .post("/api/ai/analyze-evidence")
    .set(auth())
    .send({
      assessmentId: w.assessment.id,
      evidenceId: e.uploadId,
      baseVersion: w.assessment.version,
    })
    .expect(503);
  assert.equal(
    (await db.Assessment.findOne({ id: w.assessment.id }).lean())!
      .aiObservation,
    undefined,
  );
});
test("Phase 10: incomplete rubric, missing evidence, missing confirmation and unexplained adjustment cannot sign off", async () => {
  const w = await claimed();
  const payload = {
    baseVersion: w.assessment.version,
    assessorScore: 100,
    recommendation: "Competent",
    confirmed: true,
    overrideReason: "",
  };
  const path = `/api/assessments/${w.assessment.id}/finalize`;
  await request(app).post(path).set(auth()).send(payload).expect(409);
  w.assessment = (
    await request(app)
      .put(`/api/assessments/${w.assessment.id}/practical`)
      .set(auth())
      .send({ baseVersion: w.assessment.version, rubricScores: allScores })
      .expect(200)
  ).body;
  await request(app)
    .post(path)
    .set(auth())
    .send({ ...payload, baseVersion: w.assessment.version })
    .expect(409);
  await evidence(w);
  await request(app)
    .post(path)
    .set(auth())
    .send({ ...payload, baseVersion: w.assessment.version, confirmed: false })
    .expect(400);
  await request(app)
    .post(path)
    .set(auth())
    .send({ ...payload, baseVersion: w.assessment.version, assessorScore: 80 })
    .expect(400);
});
test("Phase 10: human override, overall score, recommendation and sign-off are persisted and immutable", async () => {
  const w = await scored(),
    e = await evidence(w);
  w.assessment = (
    await request(app)
      .post("/api/ai/analyze-evidence")
      .set(auth())
      .send({
        assessmentId: w.assessment.id,
        evidenceId: e.uploadId,
        baseVersion: w.assessment.version,
      })
      .expect(200)
  ).body;
  const path = `/api/assessments/${w.assessment.id}/finalize`;
  const payload = {
    baseVersion: w.assessment.version,
    assessorScore: 90,
    recommendation: "Competent",
    confirmed: true,
    overrideReason: "",
  };
  await request(app).post(path).set(auth()).send(payload).expect(400);
  const final = await request(app)
    .post(path)
    .set(auth())
    .send({
      ...payload,
      overrideReason:
        "Synthetic test: the human observer reviewed the full procedure beyond this limited image.",
    })
    .expect(200);
  assert.equal(final.body.finalScore, 87);
  assert.equal(final.body.practicalScore, 90);
  assert.equal(final.body.practical.rubricScore, 100);
  assert.equal(final.body.aiSuggestedScore, 40);
  assert.equal(final.body.status, "SIGNED_OFF");
  assert.ok(final.body.signedOffAt);
  assert.ok(
    final.body.history.some(
      (e: { action: string }) => e.action === "ASSESSMENT_SIGNED_OFF",
    ),
  );
  await request(app)
    .put(`/api/assessments/${w.assessment.id}/practical`)
    .set(auth())
    .send({ baseVersion: final.body.version, rubricScores: allScores })
    .expect(423);
  await request(app)
    .post(path)
    .set(auth())
    .send({ ...payload, baseVersion: final.body.version })
    .expect(423);
  await request(app)
    .post("/api/ai/analyze-evidence")
    .set(auth())
    .send({
      assessmentId: w.assessment.id,
      evidenceId: e.uploadId,
      baseVersion: final.body.version,
    })
    .expect(423);
  const workerView = await request(app)
    .get("/api/workers/me")
    .auth(w.token, { type: "bearer" })
    .expect(200);
  assert.equal(workerView.body.assessment.finalScore, 87);
  assert.equal(workerView.body.profile.status, "SIGNED_OFF");
  const dashboard = await request(app)
    .get("/api/assessor/dashboard")
    .set(auth())
    .expect(200);
  assert.ok(dashboard.body.completed >= 1);
});
test("Phase 10: manual assessment can finish when AI is unavailable; prototype recommendation boundaries are correct", async () => {
  assert.equal(calculateFinal(80, 90), 87);
  assert.equal(suggestedRecommendation(75), "Competent");
  assert.equal(
    suggestedRecommendation(74),
    "Competent with minor skill-gap training",
  );
  assert.equal(suggestedRecommendation(59), "Further assessment required");
  const w = await scored();
  await evidence(w);
  const result = await request(app)
    .post(`/api/assessments/${w.assessment.id}/finalize`)
    .set(auth())
    .send({
      baseVersion: w.assessment.version,
      assessorScore: 100,
      recommendation: "Competent",
      confirmed: true,
      overrideReason: "",
    })
    .expect(200);
  assert.equal(result.body.aiSuggestedScore, undefined);
  assert.equal(result.body.finalScore, 94);
});

test("Phase 8: an upload racing with another edit cleans up only its own new evidence", async () => {
  const w = await claimed();
  let compensated = false;
  const racingStorage: ImageStorage = {
    configured: true,
    async upload(_bytes, id) {
      await db.Assessment.updateOne(
        { id: w.assessment.id },
        { $inc: { version: 1 } },
      );
      return {
        url:
          "https://res.cloudinary.com/test/image/authenticated/v1/" +
          id +
          ".jpg",
        publicId: id,
      };
    },
    async remove() {
      compensated = true;
    },
  };
  const racingApp = createApp(db, { ...config, imageStorage: racingStorage });
  await request(racingApp)
    .post(`/api/assessments/${w.assessment.id}/evidence`)
    .set(auth())
    .field("baseVersion", String(w.assessment.version))
    .field("uploadId", randomUUID())
    .attach("image", image, { filename: "race.png", contentType: "image/png" })
    .expect(409);
  assert.equal(compensated, true);
  assert.equal(
    await db.Evidence.countDocuments({ assessmentId: w.assessment.id }),
    0,
  );
});
