import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import request from "supertest";
import { connectDatabase } from "../src/models.js";
import { seedDatabase } from "../src/services.js";
import { createApp } from "../src/app.js";
import { CloudinaryStorage } from "../src/evidence.js";
import { videoAnalysisAvailable } from "../src/video.js";
import { syntheticVideo } from "../test/helpers/video.js";
import { qualification } from "../../shared/data.js";
import { questions } from "../src/questions.js";
import { rubric } from "../../shared/assessment.js";
for (const key of [
  "GEMINI_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
])
  if (!process.env[key]) throw Error("Missing required server setting: " + key);
if (!(await videoAnalysisAvailable()))
  throw Error("Install ffmpeg and ffprobe first: npm run setup:video");
const fixture = await syntheticVideo(),
  databaseName = "dakshsetu_test_" + randomUUID().replaceAll("-", ""),
  context = await connectDatabase("mongodb://127.0.0.1:27027/" + databaseName),
  db = context.models;
const storage = new CloudinaryStorage({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
let publicId: string | undefined;
try {
  await seedDatabase(db);
  const app = createApp(db, {
    jwtSecret: randomUUID(),
    clientUrls: [],
    test: true,
    ai: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    },
    imageStorage: storage,
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
  const worker = await login("worker"),
    assessor = await login("assessor"),
    user = (await request(app).get("/api/auth/me").set(worker).expect(200))
      .body;
  await request(app)
    .post("/api/workers/experience")
    .set(worker)
    .send({
      trade: "Electrician",
      yearsExperience: 8,
      experienceDescription:
        "Synthetic video integration test; house wiring, switches, MCBs and circuit testing.",
    })
    .expect(200);
  await request(app)
    .put("/api/workers/skills")
    .set(worker)
    .send({ skills: qualification.skills })
    .expect(200);
  await request(app).post("/api/qualifications/match").set(worker).expect(200);
  await request(app)
    .post("/api/self-assessment/submit")
    .set(worker)
    .send({
      responses: questions.map((q) => ({
        questionId: q.id,
        answer: q.correctAnswer,
      })),
    })
    .expect(201);
  const a = (
      await request(app)
        .post("/api/assessments")
        .set(assessor)
        .send({ workerId: user.id })
        .expect(201)
    ).body,
    path = "/api/assessments/" + a.id,
    uploadId = randomUUID();
  await request(app)
    .post(path + "/media-intents")
    .set(assessor)
    .send({
      id: uploadId,
      type: "video",
      mimeType: "video/mp4",
      filename: "synthetic-test-pattern.mp4",
      size: fixture.bytes.length,
      sha256: createHash("sha256").update(fixture.bytes).digest("hex"),
    })
    .expect(200);
  const uploaded = (
    await request(app)
      .post(path + "/videos")
      .set(assessor)
      .field("uploadId", uploadId)
      .field("baseVersion", String(a.version))
      .attach("video", fixture.bytes, {
        filename: "synthetic-test-pattern.mp4",
        contentType: "video/mp4",
      })
      .expect(201)
  ).body;
  publicId = uploaded.evidence.cloudinaryPublicId;
  await request(app)
    .get(path + "/videos/" + uploadId + "/content")
    .expect(401);
  await request(app)
    .get(path + "/videos/" + uploadId + "/content")
    .set(assessor)
    .expect(200);
  const response = await request(app)
    .post(path + "/videos/" + uploadId + "/analyse")
    .set(assessor)
    .send({ baseVersion: uploaded.assessment.version });
  if (response.status !== 200)
    throw Error(
      "Live video analysis failed (" +
        response.status +
        "): " +
        response.body.error,
    );
  assert.equal(response.body.video.analysis.observations.length, rubric.length);
  assert.ok(response.body.video.analysis.limitations.length);
  assert.equal(response.body.assessment.status, "IN_ASSESSMENT");
  assert.equal(response.body.assessment.finalScore, undefined);
  const video = await db.Evidence.findOne({ id: uploadId }).lean();
  assert.equal((video!.analysis as any).frameTimes.length, 6);
  assert.equal(await db.AIAnalysis.countDocuments({ type: "video" }), 1);
  console.log(
    JSON.stringify({
      result: "PASS",
      fixture:
        "Synthetic moving test pattern; no real electrical work or worker certification",
      flow: "metadata → private live Cloudinary video → actual FFmpeg frames → live Gemini observations → stored analysis/audit",
      frames: 6,
      observations: response.body.video.analysis.observations.length,
      assessmentStatus: response.body.assessment.status,
    }),
  );
} finally {
  try {
    if (publicId) {
      await storage.removeVideo(publicId);
      console.log(
        "Removed only the synthetic cloud video created by this test.",
      );
    }
  } finally {
    assert.equal(context.connection.name, databaseName);
    await context.connection.dropDatabase();
    await context.connection.close();
    await fixture.cleanup();
  }
}
