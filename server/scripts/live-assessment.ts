import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import request from "supertest";
import sharp from "sharp";
import { connectDatabase } from "../src/models.js";
import { seedDatabase } from "../src/services.js";
import { createApp } from "../src/app.js";
import { CloudinaryStorage } from "../src/evidence.js";
import { rubric } from "../../shared/assessment.js";
import { questions } from "../src/questions.js";

for (const name of [
  "GEMINI_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
])
  if (!process.env[name])
    throw Error(`Add ${name} to server/.env before this live test.`);
const storage = new CloudinaryStorage({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const databaseName = `dakshsetu_test_${randomUUID().replaceAll("-", "")}`;
const { connection, models } = await connectDatabase(
  `mongodb://127.0.0.1:27027/${databaseName}`,
);
let uploadedPublicId: string | undefined;
try {
  await seedDatabase(models);
  const app = createApp(models, {
    jwtSecret: randomUUID(),
    clientUrls: [],
    test: true,
    ai: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    },
    imageStorage: storage,
  });
  const login = async (email: string) =>
    (
      await request(app)
        .post("/api/auth/login")
        .send({ email, password: "demo123" })
        .expect(200)
    ).body.token as string;
  const workerToken = await login("worker@dakshsetu.demo"),
    assessorToken = await login("assessor@dakshsetu.demo");
  const w = { Authorization: "Bearer " + workerToken },
    a = { Authorization: "Bearer " + assessorToken };
  const worker = (await request(app).get("/api/auth/me").set(w).expect(200))
    .body;
  const experience = {
    trade: "Electrician",
    yearsExperience: 8,
    experienceDescription:
      "I have eight years of residential electrical experience. I install house wiring, switches and MCBs and diagnose faults.",
  };
  await request(app)
    .post("/api/workers/experience")
    .set(w)
    .send(experience)
    .expect(200);
  const skills = await request(app)
    .post("/api/ai/extract-skills")
    .set(w)
    .send(experience)
    .expect(200);
  assert.ok(skills.body.skills.length > 0);
  await request(app)
    .put("/api/workers/skills")
    .set(w)
    .send({ skills: skills.body.skills })
    .expect(200);
  await request(app).post("/api/qualifications/match").set(w).expect(200);
  await request(app)
    .post("/api/self-assessment/submit")
    .set(w)
    .send({
      responses: questions.map((q) => ({
        questionId: q.id,
        answer: q.correctAnswer,
      })),
    })
    .expect(201);
  let assessment = (
    await request(app)
      .post("/api/assessments")
      .set(a)
      .send({ workerId: worker.id })
      .expect(201)
  ).body;
  assessment = (
    await request(app)
      .put(`/api/assessments/${assessment.id}/practical`)
      .set(a)
      .send({
        baseVersion: assessment.version,
        rubricScores: rubric.map((r) => ({
          criterionId: r.id,
          score: 3,
          remark: "Synthetic end-to-end test; not a real worker certification.",
        })),
      })
      .expect(200)
  ).body;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="760"><rect width="1000" height="760" fill="#f5f7fc"/><text x="50" y="55" font-family="sans-serif" font-size="26" fill="#0b2a5b">SYNTHETIC TEST EVIDENCE — not a real installation</text><rect x="110" y="105" width="780" height="525" rx="20" fill="#d8dce1" stroke="#7b8692" stroke-width="8"/><rect x="170" y="155" width="250" height="160" rx="9" fill="white" stroke="#8e99a7" stroke-width="3"/><rect x="220" y="185" width="65" height="70" rx="5" fill="#0b2a5b"/><rect x="310" y="185" width="65" height="70" rx="5" fill="#c5cbd4"/><text x="195" y="292" font-family="sans-serif" font-size="22" fill="#42546d">Training switches</text><rect x="570" y="155" width="220" height="160" rx="9" fill="white" stroke="#8e99a7" stroke-width="3"/><rect x="600" y="180" width="62" height="78" rx="4" fill="#c8d0db"/><rect x="690" y="180" width="62" height="78" rx="4" fill="#c8d0db"/><text x="610" y="292" font-family="sans-serif" font-size="22" fill="#42546d">MCB model</text><path d="M235 330V450H600V330M340 330V510H710V330" fill="none" stroke="#e38022" stroke-width="16" stroke-linecap="round"/><path d="M270 330V400H660V330" fill="none" stroke="#2861a7" stroke-width="13" stroke-linecap="round"/><text x="165" y="590" font-family="sans-serif" font-size="19" fill="#5c6e85">Illustration for testing uploads and AI limits only</text><text x="55" y="700" font-family="sans-serif" font-size="24" fill="#a05d14">No live voltage, isolation, or testing procedure can be verified.</text></svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const fixture = resolve("../docs/fixtures/synthetic-switchboard.png");
  await mkdir(resolve("../docs/fixtures"), { recursive: true });
  await writeFile(fixture, image);
  const uploadId = randomUUID();
  const uploaded = await request(app)
    .post(`/api/assessments/${assessment.id}/evidence`)
    .set(a)
    .field("baseVersion", String(assessment.version))
    .field("uploadId", uploadId)
    .attach("image", image, {
      filename: "synthetic-switchboard.png",
      contentType: "image/png",
    });
  if (uploaded.status !== 201)
    throw Error(
      `Cloudinary upload failed (${uploaded.status}): ${uploaded.body.error}`,
    );
  uploadedPublicId = uploaded.body.evidence.cloudinaryPublicId;
  assessment = uploaded.body.assessment;
  const content = await request(app)
    .get(`/api/assessments/${assessment.id}/evidence/${uploadId}/content`)
    .set(a)
    .expect(200);
  assert.ok(Buffer.isBuffer(content.body));
  const analysed = await request(app)
    .post("/api/ai/analyze-evidence")
    .set(a)
    .send({
      assessmentId: assessment.id,
      evidenceId: uploadId,
      baseVersion: assessment.version,
    });
  if (analysed.status !== 200)
    throw Error(
      `Live image observation failed (${analysed.status}): ${analysed.body.error}`,
    );
  assessment = analysed.body;
  assert.equal(assessment.aiObservation.observations.length, rubric.length);
  assert.ok(assessment.aiObservation.limitations.length > 0);
  const signed = await request(app)
    .post(`/api/assessments/${assessment.id}/finalize`)
    .set(a)
    .send({
      baseVersion: assessment.version,
      assessorScore: 90,
      recommendation: "Competent",
      overrideReason:
        "Synthetic end-to-end test only: manual review exercises the override path; no real worker outcome is being certified.",
      confirmed: true,
    })
    .expect(200);
  assert.equal(signed.body.status, "SIGNED_OFF");
  assert.equal(signed.body.finalScore, 93);
  await request(app)
    .put(`/api/assessments/${assessment.id}/practical`)
    .set(a)
    .send({ baseVersion: signed.body.version, rubricScores: [] })
    .expect(423);
  const workerView = await request(app)
    .get("/api/workers/me")
    .set(w)
    .expect(200);
  assert.equal(workerView.body.assessment.finalScore, 93);
  console.log(
    JSON.stringify({
      result: "PASS",
      flow: "worker → live skill extraction → self-assessment → assessor → rubric → live Cloudinary upload → live Gemini image observation → override → sign-off → worker result",
      skills: skills.body.skills,
      aiScore: assessment.aiSuggestedScore,
      aiObservations: assessment.aiObservation.observations.length,
      finalScore: signed.body.finalScore,
      status: signed.body.status,
      fixture,
    }),
  );
} finally {
  if (uploadedPublicId) {
    await storage.remove(uploadedPublicId);
    console.log(
      "Removed only the synthetic cloud asset created by this live test.",
    );
  }
  assert.equal(connection.name, databaseName);
  assert.match(connection.name, /^dakshsetu_test_[a-f0-9]+$/);
  await connection.dropDatabase();
  await connection.close();
}
