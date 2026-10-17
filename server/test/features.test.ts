import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import request from "supertest";
import sharp from "sharp";
import { connectDatabase } from "../src/models.js";
import { seedDatabase } from "../src/services.js";
import { createApp } from "../src/app.js";
import { qualification } from "../../shared/data.js";
import {
  rubric,
  legacyRubric,
  calculatePractical,
} from "../../shared/assessment.js";
import { questions } from "../src/questions.js";
import { syntheticRatings } from "../../shared/consistency.js";
const dbName = "dakshsetu_test_" + randomUUID().replaceAll("-", "");
let context: Awaited<ReturnType<typeof connectDatabase>>,
  app: ReturnType<typeof createApp>,
  assessor: Record<string, string>,
  admin: Record<string, string>,
  image: Buffer;
const ai = {
  apiKey: "test",
  model: "test",
  fetcher: async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    observations: rubric.map((r) => ({
                      criterionId: r.id,
                      status: "unclear",
                      confidence: 0.8,
                    })),
                    warnings: ["Synthetic test"],
                    suggestedScore: 4,
                    maxScore: 10,
                    summary: "Synthetic test",
                    limitations: ["Single image only"],
                  }),
                },
              ],
            },
          },
        ],
      }),
    ),
};
before(async () => {
  context = await connectDatabase("mongodb://127.0.0.1:27027/" + dbName);
  await seedDatabase(context.models);
  app = createApp(context.models, {
    jwtSecret: "features-test-secret",
    publicAppUrl: "https://dakshsetu.example",
    clientUrls: [],
    test: true,
    ai,
    imageStorage: {
      configured: true,
      async upload(_, id) {
        return {
          url: "https://res.cloudinary.com/test/image/authenticated/" + id,
          publicId: id,
        };
      },
      async remove() {},
      async uploadVideo(_, id) {
        return {
          url: "https://res.cloudinary.com/test/video/authenticated/" + id,
          publicId: id,
        };
      },
      async removeVideo() {},
    },
  });
  const login = async (role: string) => ({
    Authorization:
      "Bearer " +
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: role + "@dakshsetu.demo", password: "demo123" })
          .expect(200)
      ).body.token,
  });
  assessor = await login("assessor");
  admin = await login("admin");
  image = await sharp({
    create: { width: 30, height: 30, channels: 3, background: "#abc" },
  })
    .png()
    .toBuffer();
});
after(async () => {
  if (context) {
    assert.equal(context.connection.name, dbName);
    await context.connection.dropDatabase();
    await context.connection.close();
  }
});
test("Consistency dashboard has no invented results, imports validated ratings privately, and calibration references stay hidden until submission", async () => {
  const initial = (
    await request(app).get("/api/admin/quality").set(admin).expect(200)
  ).body;
  assert.deepEqual(initial.datasets, []);
  assert.equal(initial.aiAgreement, null);
  const csv =
    "case_id,assessor_id,condition,score\n" +
    syntheticRatings()
      .map((r) => [r.caseId, r.assessorId, r.condition, r.score].join(","))
      .join("\n");
  await request(app)
    .post("/api/admin/quality/datasets")
    .set(assessor)
    .send({ title: "Synthetic API test", csv })
    .expect(403);
  const imported = (
    await request(app)
      .post("/api/admin/quality/datasets")
      .set(admin)
      .send({ title: "Synthetic API test", csv })
      .expect(201)
  ).body;
  assert.equal(imported.comparison.pairedUnits, 24);
  assert.equal(imported.ratings, undefined);
  await request(app)
    .get("/api/admin/quality/datasets/" + imported.id)
    .expect(401);
  assert.equal(
    (
      await request(app)
        .get("/api/admin/quality/datasets/" + imported.id)
        .set(admin)
        .expect(200)
    ).body.comparison.assisted.metric,
    "Cohen’s Kappa",
  );
  await request(app)
    .post("/api/admin/quality/datasets")
    .set(admin)
    .send({
      title: "Invalid",
      csv: csv + "\ndemo-case-1,demo-assessor-1,unassisted,0",
    })
    .expect(400);
  const sample = (
    await request(app)
      .post("/api/admin/calibration/cases")
      .set(admin)
      .send({
        title: "Synthetic safe-wiring case",
        description:
          "Synthetic scenario supplied by an administrator for a controlled API test.",
        referenceScores: rubric.map((r) => ({ criterionId: r.id, score: 2 })),
      })
      .expect(201)
  ).body;
  const cases = (
    await request(app).get("/api/calibration/cases").set(assessor).expect(200)
  ).body;
  assert.equal(cases[0].referenceScores, undefined);
  const result = (
    await request(app)
      .post("/api/calibration/cases/" + sample.id + "/score")
      .set(assessor)
      .send({ scores: rubric.map((r) => ({ criterionId: r.id, score: 3 })) })
      .expect(200)
  ).body;
  assert.equal(result.score, 100);
  assert.equal(result.reference, 67);
  assert.equal(result.deviation, 33);
  const replay = (
    await request(app)
      .post("/api/calibration/cases/" + sample.id + "/score")
      .set(assessor)
      .send({ scores: rubric.map((r) => ({ criterionId: r.id, score: 0 })) })
      .expect(200)
  ).body;
  assert.equal(replay.score, 100);
});
async function mapped() {
  const registration = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Synthetic Passport Worker",
      email: randomUUID() + "@example.test",
      phone: "9876543210",
      password: "testpass123",
      preferredLanguage: "en",
    })
    .expect(201);
  const headers = { Authorization: "Bearer " + registration.body.token },
    user = registration.body.user;
  await request(app)
    .post("/api/workers/experience")
    .set(headers)
    .send({
      trade: "Electrician",
      yearsExperience: 8,
      experienceDescription:
        "I install switches, MCBs and wiring and test circuits.",
    })
    .expect(200);
  await request(app)
    .put("/api/workers/skills")
    .set(headers)
    .send({ skills: qualification.skills })
    .expect(200);
  await request(app).post("/api/qualifications/match").set(headers).expect(200);
  const profile = (await request(app).get("/api/workers/me").set(headers)).body
    .profile;
  return { headers, user, profile };
}
const answers = () =>
  questions.map((q) => ({ questionId: q.id, answer: q.correctAnswer }));
async function started() {
  const w = await mapped();
  const a = (
    await request(app)
      .post("/api/self-assessment/submit")
      .set(w.headers)
      .send({ responses: answers() })
      .expect(201)
  ).body;
  const assessment = (
    await request(app)
      .post("/api/assessments")
      .set(assessor)
      .send({ workerId: w.user.id })
      .expect(201)
  ).body;
  return { ...w, assessment };
}
const rows = () =>
  rubric.map((r) => ({
    criterionId: r.id,
    score: 3,
    remark: "Synthetic test",
  }));
async function signoff(w: Awaited<ReturnType<typeof started>>, weak = false) {
  let a = (
    await request(app)
      .put(`/api/assessments/${w.assessment.id}/practical`)
      .set(assessor)
      .send({
        baseVersion: w.assessment.version,
        rubricScores: rows().map((r, i) =>
          weak && i < 2 ? { ...r, score: 1 } : r,
        ),
      })
      .expect(200)
  ).body;
  const upload = await request(app)
    .post(`/api/assessments/${a.id}/evidence`)
    .set(assessor)
    .field("uploadId", randomUUID())
    .field("baseVersion", String(a.version))
    .attach("image", image, {
      filename: "synthetic.png",
      contentType: "image/png",
    })
    .expect(201);
  a = upload.body.assessment;
  a = (
    await request(app)
      .post("/api/ai/analyze-evidence")
      .set(assessor)
      .send({
        assessmentId: a.id,
        evidenceId: upload.body.evidence.id,
        baseVersion: a.version,
      })
      .expect(200)
  ).body;
  return (
    await request(app)
      .post(`/api/assessments/${a.id}/finalize`)
      .set(assessor)
      .send({
        baseVersion: a.version,
        assessorScore: 90,
        recommendation: "Competent",
        overrideReason: "Synthetic human review verifies the full procedure.",
        confirmed: true,
      })
      .expect(200)
  ).body;
}
test("Phase 11: private passports require sign-off and preserve a stable snapshot of real scores", async () => {
  const w = await started();
  await request(app)
    .get("/api/passports/" + w.assessment.id)
    .set(w.headers)
    .expect(409);
  const a = await signoff(w);
  const response = await request(app)
    .get("/api/passports/" + a.id)
    .set(w.headers)
    .expect(200);
  const p = response.body;
  assert.equal(p.overallScore, 93);
  assert.equal(p.practicalScore, 90);
  assert.equal(p.practicalCriteria.length, rubric.length);
  assert.equal(p.competencyScores.length, 5);
  assert.ok(response.headers["cache-control"].includes("no-store"));
  assert.equal(p.workerName, w.user.name);
  await context.models.User.updateOne(
    { id: w.user.id },
    { $set: { name: "Changed test name" } },
  );
  const again = (
    await request(app)
      .get("/api/passports/" + w.user.id)
      .set(assessor)
      .expect(200)
  ).body;
  assert.equal(again.id, p.id);
  assert.equal(again.generatedAt, p.generatedAt);
  assert.equal(again.workerName, p.workerName);
  assert.equal(
    await context.models.SkillPassport.countDocuments({ assessmentId: a.id }),
    1,
  );
  const other = await mapped();
  await request(app)
    .get("/api/passports/" + a.id)
    .set(other.headers)
    .expect(403);
  await request(app)
    .get("/api/passports/" + a.id)
    .expect(401);
  await request(app)
    .get("/api/passports/" + a.id)
    .set(admin)
    .expect(200);
});
test("Phase 12: sync saves practical work once, validates retry content and rejects stale or locked writes", async () => {
  const w = await started(),
    id = randomUUID();
  const batch = {
    items: [
      {
        id,
        type: "practical",
        resourceId: w.assessment.id,
        payload: { baseVersion: w.assessment.version, rubricScores: rows() },
      },
    ],
  };
  const [first, second] = await Promise.all([
    request(app).post("/api/sync").set(assessor).send(batch).expect(200),
    request(app).post("/api/sync").set(assessor).send(batch).expect(200),
  ]);
  assert.equal(first.body.results[0].status, "synced");
  assert.equal(second.body.results[0].status, "synced");
  const saved = await context.models.Assessment.findOne({
    id: w.assessment.id,
  }).lean();
  assert.equal(saved!.version, w.assessment.version + 1);
  assert.equal(saved!.history.filter((h) => h.mutationId === id).length, 1);
  const changed = structuredClone(batch);
  changed.items[0].payload.rubricScores[0].score = 0;
  assert.equal(
    (await request(app).post("/api/sync").set(assessor).send(changed)).body
      .results[0].httpStatus,
    409,
  );
  const stale = structuredClone(batch);
  stale.items[0].id = randomUUID();
  assert.equal(
    (await request(app).post("/api/sync").set(assessor).send(stale)).body
      .results[0].status,
    "conflict",
  );
  await context.models.Assessment.updateOne(
    { id: w.assessment.id },
    { $set: { status: "SIGNED_OFF" } },
  );
  stale.items[0].payload.baseVersion = saved!.version;
  assert.equal(
    (await request(app).post("/api/sync").set(assessor).send(stale)).body
      .results[0].httpStatus,
    423,
  );
  assert.equal(
    (await request(app).post("/api/sync").set(w.headers).send(batch)).body
      .results[0].httpStatus,
    403,
  );
});
test("Phase 12: offline self submissions are scored by the server and detect changed worker profiles", async () => {
  const w = await mapped();
  const batch = {
    items: [
      {
        id: randomUUID(),
        type: "self",
        resourceId: qualification.id,
        payload: {
          qualificationId: qualification.id,
          profileVersion: w.profile.version,
          responses: answers(),
        },
      },
    ],
  };
  await context.models.Profile.updateOne(
    { userId: w.user.id },
    { $inc: { version: 1 } },
  );
  const conflict = await request(app)
    .post("/api/sync")
    .set(w.headers)
    .send(batch)
    .expect(200);
  assert.equal(conflict.body.results[0].status, "conflict");
  assert.equal(
    await context.models.Assessment.countDocuments({ workerId: w.user.id }),
    0,
  );
  batch.items[0].payload.profileVersion++;
  const result = await request(app)
    .post("/api/sync")
    .set(w.headers)
    .send(batch)
    .expect(200);
  assert.equal(result.body.results[0].data.selfAssessmentScore, 100);
  const repeat = await request(app)
    .post("/api/sync")
    .set(w.headers)
    .send(batch)
    .expect(200);
  assert.equal(repeat.body.results[0].data.id, result.body.results[0].data.id);
  await request(app).post("/api/sync").send(batch).expect(401);
  await request(app)
    .post("/api/sync")
    .set(w.headers)
    .send({
      items: [
        {
          ...batch.items[0],
          payload: { ...batch.items[0].payload, finalScore: 100 },
        },
      ],
    })
    .expect(400);
});
test("Phase 13: admin pages enforce roles, redact credentials, paginate and read durable audit records", async () => {
  const w = await started();
  await signoff(w);
  for (const url of [
    "/api/admin/stats",
    "/api/admin/users",
    "/api/admin/qualifications",
    "/api/admin/assessments",
    "/api/admin/audit-logs",
  ]) {
    await request(app).get(url).expect(401);
    await request(app).get(url).set(w.headers).expect(403);
    await request(app).get(url).set(assessor).expect(403);
    const response = await request(app).get(url).set(admin).expect(200);
    assert.ok(!JSON.stringify(response.body).includes("passwordHash"));
    assert.ok(!JSON.stringify(response.body).includes("imageData"));
  }
  const stats = (await request(app).get("/api/admin/stats").set(admin)).body;
  assert.equal(
    stats.workers,
    await context.models.User.countDocuments({ role: "worker" }),
  );
  await request(app).get("/api/admin/users?page=0").set(admin).expect(400);
  const logs = (await request(app).get("/api/admin/audit-logs").set(admin)).body
    .items;
  for (const action of [
    "WORKER_SKILLS_CONFIRMED",
    "QUALIFICATION_MAPPED",
    "SELF_ASSESSMENT_COMPLETED",
    "ASSESSOR_SCORE_CHANGED",
    "AI_EVIDENCE_ANALYZED",
    "AI_SCORE_OVERRIDDEN",
    "ASSESSMENT_SIGNED_OFF",
  ])
    assert.ok(
      logs.some((log: { action: string }) => log.action === action),
      action,
    );
  const records = (await request(app).get("/api/admin/assessments").set(admin))
    .body.items;
  assert.ok(
    records.every((a: Record<string, unknown>) => !a.responses && !a.history),
  );
});
test("QR credentials verify minimal data, detect tampering, generate a real Unicode PDF and allow admin-only permanent revocation", async () => {
  const w = await started();
  await context.models.User.updateOne(
    { id: w.user.id },
    { $set: { name: "रमेश पाटील / Ramesh Patil" } },
  );
  const a = await signoff(w);
  const meta = (
    await request(app)
      .get("/api/credentials/assessment/" + a.id)
      .set(w.headers)
      .expect(200)
  ).body;
  assert.match(meta.credentialId, /^DS-RPL-\d{4}-[A-F0-9]{32}$/);
  assert.equal(
    meta.verificationUrl,
    "https://dakshsetu.example/verify/" + meta.credentialId,
  );
  const path = "/api/credentials/" + meta.credentialId + "/verify",
    verified = (await request(app).get(path).expect(200)).body;
  assert.equal(verified.status, "VALID");
  assert.equal(verified.workerName, "रमेश पाटील / Ramesh Patil");
  assert.equal(verified.overallScore, 93);
  for (const forbidden of [
    "workerId",
    "assessmentId",
    "assessorId",
    "email",
    "phone",
    "evidence",
    "gaps",
    "verificationHash",
  ])
    assert.equal(
      JSON.stringify(verified).includes(forbidden),
      false,
      forbidden,
    );
  const other = await mapped();
  await request(app)
    .get("/api/credentials/assessment/" + a.id)
    .set(other.headers)
    .expect(403);
  await request(app)
    .get("/api/passports/" + a.id + "/pdf")
    .expect(401);
  const pdf = await request(app)
    .get("/api/passports/" + a.id + "/pdf")
    .set(w.headers)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on("data", (c) => chunks.push(Buffer.from(c)));
      response.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.match(pdf.headers["content-type"], /application\/pdf/);
  assert.ok(Buffer.isBuffer(pdf.body));
  assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
  const folder = resolve("../output/pdf");
  await mkdir(folder, { recursive: true });
  await writeFile(
    resolve(folder, "dakshsetu-synthetic-passport.pdf"),
    pdf.body,
  );
  await context.models.SkillPassport.updateOne(
    { assessmentId: a.id },
    { $set: { overallScore: 99 } },
  );
  await request(app).get(path).expect(404);
  await context.models.SkillPassport.updateOne(
    { assessmentId: a.id },
    { $set: { overallScore: 93 } },
  );
  await request(app)
    .post("/api/admin/credentials/" + meta.credentialId + "/revoke")
    .set(w.headers)
    .send({ revision: 1, reason: "Synthetic revocation test" })
    .expect(403);
  await request(app)
    .post("/api/admin/credentials/" + meta.credentialId + "/revoke")
    .set(admin)
    .send({ revision: 1, reason: "Synthetic revocation test" })
    .expect(200);
  assert.equal(
    (await request(app).get(path).expect(200)).body.status,
    "REVOKED",
  );
  assert.deepEqual(
    (await request(app).get(path)).body.verifiedCompetencies,
    [],
  );
  assert.equal(
    (await context.models.Assessment.findOne({ id: a.id }).lean())!.finalScore,
    93,
  );
  await request(app).get("/api/credentials/unknown/verify").expect(404);
});
test("Targeted reassessment requires new evidence and assigned human sign-off, appends history and never changes the original outcome", async () => {
  const w = await started(),
    a = await signoff(w, true),
    original = await context.models.Assessment.findOne({ id: a.id }).lean(),
    path = "/api/reassessments";
  const initial = (
    await request(app)
      .get(path + "/assessment/" + a.id)
      .set(w.headers)
      .expect(200)
  ).body;
  assert.equal(initial.weak[0].key, "practical:0");
  await request(app)
    .post(path)
    .set(w.headers)
    .send({ assessmentId: a.id, competencyKey: "practical:2" })
    .expect(409);
  const r = (
    await request(app)
      .post(path)
      .set(w.headers)
      .send({ assessmentId: a.id, competencyKey: "practical:0" })
      .expect(201)
  ).body;
  assert.equal(
    (
      await request(app)
        .post(path)
        .set(w.headers)
        .send({ assessmentId: a.id, competencyKey: "practical:0" })
    ).body.id,
    r.id,
  );
  const other = await mapped();
  await request(app)
    .get(path + "/assessment/" + a.id)
    .set(other.headers)
    .expect(403);
  const input = {
    baseVersion: 0,
    score: 3,
    remark: "New human observation confirms this competency.",
    confirmed: true,
  };
  await request(app)
    .post(path + "/" + r.id + "/complete")
    .set(w.headers)
    .send(input)
    .expect(403);
  await request(app)
    .post(path + "/" + r.id + "/complete")
    .set(assessor)
    .send(input)
    .expect(409);
  await request(app)
    .post(path + "/" + r.id + "/evidence")
    .set(assessor)
    .field("uploadId", randomUUID())
    .field("baseVersion", "0")
    .attach("image", image, { filename: "old.png", contentType: "image/png" })
    .expect(409);
  const newImage = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#ffaa00" },
    })
      .png()
      .toBuffer(),
    uploadId = randomUUID();
  const uploaded = (
    await request(app)
      .post(path + "/" + r.id + "/evidence")
      .set(assessor)
      .field("uploadId", uploadId)
      .field("baseVersion", "0")
      .attach("image", newImage, {
        filename: "new.png",
        contentType: "image/png",
      })
      .expect(201)
  ).body;
  await request(app)
    .get(path + "/" + r.id + "/evidence/" + uploadId)
    .set(other.headers)
    .expect(403);
  await request(app)
    .get(path + "/" + r.id + "/evidence/" + uploadId)
    .set(w.headers)
    .expect(200);
  await request(app)
    .post(path + "/" + r.id + "/complete")
    .set(assessor)
    .send(input)
    .expect(409);
  const done = (
    await request(app)
      .post(path + "/" + r.id + "/complete")
      .set(assessor)
      .send({ ...input, baseVersion: uploaded.version })
      .expect(200)
  ).body;
  assert.equal(done.newScore, 100);
  await request(app)
    .post(path + "/" + r.id + "/complete")
    .set(assessor)
    .send({ ...input, baseVersion: uploaded.version })
    .expect(200);
  await request(app)
    .post(path + "/" + r.id + "/complete")
    .set(assessor)
    .send({ ...input, baseVersion: uploaded.version, score: 2 })
    .expect(409);
  const meta = (
    await request(app)
      .get("/api/credentials/assessment/" + a.id)
      .set(w.headers)
      .expect(200)
  ).body;
  assert.equal(meta.revision, 2);
  assert.equal(meta.status, "UPDATED");
  assert.equal(meta.history.length, 1);
  assert.equal(
    meta.competencies.find((c: any) => c.key === "practical:0").score,
    100,
  );
  assert.deepEqual(
    await context.models.Assessment.findOne({ id: a.id }).lean(),
    original,
  );
  assert.equal(
    (await context.models.SkillPassport.findOne({ assessmentId: a.id }).lean())!
      .practicalCriteria[0].score,
    1,
  );
  const publicRecord = (
    await request(app)
      .get("/api/credentials/" + meta.credentialId + "/verify")
      .expect(200)
  ).body;
  assert.equal(publicRecord.overallScore, a.finalScore);
  assert.ok(
    publicRecord.verifiedCompetencies.some(
      (c: any) => c.source === "reassessment",
    ),
  );
  await request(app)
    .post("/api/admin/credentials/" + meta.credentialId + "/revoke")
    .set(admin)
    .send({ revision: 2, reason: "Synthetic integrity test revocation" })
    .expect(200);
  assert.equal(
    (
      await request(app)
        .get("/api/credentials/assessment/" + a.id)
        .set(w.headers)
    ).body.status,
    "REVOKED",
  );
  const afterRevocation = (
    await request(app)
      .post(path)
      .set(w.headers)
      .send({ assessmentId: a.id, competencyKey: "practical:1" })
      .expect(201)
  ).body;
  const laterImage = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "#dd0000" },
  })
    .png()
    .toBuffer();
  const laterUpload = (
    await request(app)
      .post(path + "/" + afterRevocation.id + "/evidence")
      .set(assessor)
      .field("uploadId", randomUUID())
      .field("baseVersion", "0")
      .attach("image", laterImage, {
        filename: "later.png",
        contentType: "image/png",
      })
      .expect(201)
  ).body;
  await request(app)
    .post(path + "/" + afterRevocation.id + "/complete")
    .set(assessor)
    .send({ ...input, baseVersion: laterUpload.version })
    .expect(200);
  const stillRevoked = (
    await request(app)
      .get("/api/credentials/assessment/" + a.id)
      .set(w.headers)
      .expect(200)
  ).body;
  assert.equal(stillRevoked.status, "REVOKED");
  assert.equal(stillRevoked.revision, 3);
  assert.equal(stillRevoked.history.length, 2);
});
test("Advanced mapping persists a real explanation and conservative partial matches", async () => {
  const w = await mapped();
  await request(app)
    .put("/api/workers/skills")
    .set(w.headers)
    .send({ skills: ["House wiring", "MCB Installation"] })
    .expect(200);
  const result = (
    await request(app)
      .post("/api/qualifications/match")
      .set(w.headers)
      .expect(200)
  ).body;
  assert.deepEqual(result.partialMatches, [
    { skill: "Residential Wiring", source: "House wiring" },
  ]);
  assert.ok(!result.matchedSkills.includes("Safety Practices"));
  assert.ok(result.gaps.includes("Safety Practices"));
  const p = await context.models.Profile.findOne({ userId: w.user.id }).lean();
  assert.equal(p!.matchDetails!.matchScore, result.matchScore);
  assert.equal(p!.matchDetails!.explanation, result.explanation);
});
test("Versioned practical rubric preserves legacy eight-criterion assessments and rejects new criteria on them", async () => {
  const w = await started();
  assert.equal(w.assessment.rubricVersion, 2);
  await context.models.Assessment.updateOne(
    { id: w.assessment.id },
    { $set: { rubricVersion: 1 } },
  );
  const path = "/api/assessments/" + w.assessment.id + "/practical";
  await request(app)
    .put(path)
    .set(assessor)
    .send({
      baseVersion: w.assessment.version,
      rubricScores: [{ criterionId: "ppe", score: 3 }],
    })
    .expect(400);
  const legacyScores = legacyRubric.map((r) => ({
    criterionId: r.id,
    score: 3,
    remark: "Legacy test",
  }));
  const a = (
    await request(app)
      .put(path)
      .set(assessor)
      .send({ baseVersion: w.assessment.version, rubricScores: legacyScores })
      .expect(200)
  ).body;
  assert.equal(a.practicalScore, calculatePractical(legacyScores, 1));
  assert.equal(a.practicalScore, 100);
  assert.equal(a.practical.rubricScores.length, 8);
  assert.equal(a.practical.rubricScores[2].weight, 10);
  const uploaded = (
    await request(app)
      .post(`/api/assessments/${a.id}/evidence`)
      .set(assessor)
      .field("uploadId", randomUUID())
      .field("baseVersion", String(a.version))
      .attach("image", image, {
        filename: "legacy.png",
        contentType: "image/png",
      })
      .expect(201)
  ).body;
  await request(app)
    .post(`/api/assessments/${a.id}/finalize`)
    .set(assessor)
    .send({
      baseVersion: uploaded.assessment.version,
      assessorScore: 100,
      recommendation: "Competent",
      confirmed: true,
    })
    .expect(200);
  const p = (
    await request(app)
      .get("/api/passports/" + a.id)
      .set(w.headers)
      .expect(200)
  ).body;
  assert.equal(p.practicalCriteria.length, 8);
  assert.equal(p.overallScore, 100);
});
test("Phase 14: production can disable all published demo credentials without changing existing users", async () => {
  const secure = createApp(context.models, {
    jwtSecret: "production-test",
    clientUrls: [],
    test: true,
    ai,
    allowDemoLogin: false,
  });
  for (const role of ["worker", "assessor", "admin"])
    await request(secure)
      .post("/api/auth/login")
      .send({ email: role + "@dakshsetu.demo", password: "demo123" })
      .expect(401);
  assert.equal(
    await context.models.User.countDocuments({
      email: {
        $in: [
          "worker@dakshsetu.demo",
          "admin@dakshsetu.demo",
          "assessor@dakshsetu.demo",
        ],
      },
    }),
    3,
  );
});
test("Private video upload saves metadata first, validates ownership and content, deduplicates retries and exposes manual review fallback", async () => {
  const w = await started(),
    uploadId = randomUUID(),
    bytes = Buffer.alloc(512);
  bytes.write("ftyp", 4, "ascii");
  const metadata = {
    id: uploadId,
    type: "video",
    mimeType: "video/mp4",
    filename: "synthetic-header-test.mp4",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const path = `/api/assessments/${w.assessment.id}`;
  const unrelated = await started();
  await request(app)
    .post(path + "/media-intents")
    .set(unrelated.headers)
    .send(metadata)
    .expect(403);
  await request(app)
    .post(path + "/media-intents")
    .set(assessor)
    .send(metadata)
    .expect(200);
  assert.equal(
    (await context.models.MediaIntent.findOne({ id: uploadId }).lean())!.status,
    "PENDING",
  );
  await request(app)
    .post(path + "/media-intents")
    .set(assessor)
    .send({ ...metadata, sha256: "a".repeat(64) })
    .expect(409);
  const result = (
    await request(app)
      .post(path + "/videos")
      .set(assessor)
      .field("uploadId", uploadId)
      .field("baseVersion", String(w.assessment.version))
      .attach("video", bytes, {
        filename: metadata.filename,
        contentType: "video/mp4",
      })
      .expect(201)
  ).body;
  assert.equal(result.evidence.mediaData, undefined);
  assert.equal(result.evidence.type, "video");
  assert.equal(
    (await context.models.MediaIntent.findOne({ id: uploadId }).lean())!.status,
    "UPLOADED",
  );
  await request(app)
    .post(path + "/videos")
    .set(assessor)
    .field("uploadId", uploadId)
    .field("baseVersion", String(w.assessment.version))
    .attach("video", bytes, {
      filename: metadata.filename,
      contentType: "video/mp4",
    })
    .expect(200);
  assert.equal(
    await context.models.Evidence.countDocuments({ id: uploadId }),
    1,
  );
  await request(app)
    .get(path + "/videos/" + uploadId + "/content")
    .expect(401);
  await request(app)
    .get(path + "/videos/" + uploadId + "/content")
    .set(unrelated.headers)
    .expect(403);
  const content = await request(app)
    .get(path + "/videos/" + uploadId + "/content")
    .set(assessor)
    .expect(200);
  assert.match(content.headers["cache-control"], /no-store/);
  assert.equal(content.headers["content-type"], "video/mp4");
  const list = (
    await request(app)
      .get(path + "/videos")
      .set(assessor)
      .expect(200)
  ).body;
  assert.equal(list.items.length, 1);
  assert.ok(!JSON.stringify(list).includes("mediaData"));
  if (!list.analysisAvailable) {
    const failure = await request(app)
      .post(path + "/videos/" + uploadId + "/analyse")
      .set(assessor)
      .send({ baseVersion: result.assessment.version })
      .expect(503);
    assert.equal(failure.body.code, "VIDEO_ANALYSIS_UNAVAILABLE");
  }
  await request(app)
    .post(path + "/videos")
    .set(assessor)
    .field("uploadId", randomUUID())
    .field("baseVersion", String(result.assessment.version))
    .attach("video", Buffer.from("not video"), {
      filename: "forged.mp4",
      contentType: "video/mp4",
    })
    .expect(415);
  const oversized = await request(app)
    .post(path + "/videos")
    .set(assessor)
    .field("uploadId", randomUUID())
    .field("baseVersion", String(result.assessment.version))
    .attach("video", Buffer.alloc(10 * 1024 * 1024 + 1), {
      filename: "too-large.mp4",
      contentType: "video/mp4",
    })
    .expect(413);
  assert.equal(oversized.body.error, "Choose a video smaller than 10 MB.");
  await context.models.Assessment.updateOne(
    { id: w.assessment.id },
    { $set: { status: "SIGNED_OFF" } },
  );
  await request(app)
    .post(path + "/media-intents")
    .set(assessor)
    .send({ ...metadata, id: randomUUID() })
    .expect(423);
});
