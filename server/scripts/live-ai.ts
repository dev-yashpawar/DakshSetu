import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { connectDatabase } from "../src/models.js";
import { seedDatabase } from "../src/services.js";
import { createApp } from "../src/app.js";
if (!process.env.GEMINI_API_KEY)
  throw Error(
    "Add GEMINI_API_KEY to server/.env before running the live test.",
  );
const databaseName = `dakshsetu_test_${randomUUID().replaceAll("-", "")}`;
const { connection, models } = await connectDatabase(
  `mongodb://127.0.0.1:27027/${databaseName}`,
);
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
  });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "worker@dakshsetu.demo", password: "demo123" })
    .expect(200);
  const auth = { Authorization: "Bearer " + login.body.token };
  const input = {
    experienceDescription:
      "I have worked in residential electrical work for 8 years. I do house wiring, install switches, fans and MCBs and repair electrical faults.",
    trade: "Electrician",
    yearsExperience: 8,
  };
  await request(app)
    .post("/api/workers/experience")
    .set(auth)
    .send(input)
    .expect(200);
  const extraction = await request(app)
    .post("/api/ai/extract-skills")
    .set(auth)
    .send(input);
  if (extraction.status !== 200)
    throw Error(
      `Live Gemini extraction failed (${extraction.status}): ${extraction.body.error}`,
    );
  assert.equal(extraction.body.trade, "Electrician");
  assert.ok(extraction.body.skills.length > 0);
  assert.ok(extraction.body.skills.length <= 20);
  const state = await request(app).get("/api/workers/me").set(auth).expect(200);
  assert.deepEqual(state.body.profile.detectedSkills, extraction.body.skills);
  await request(app)
    .put("/api/workers/skills")
    .set(auth)
    .send({ skills: extraction.body.skills })
    .expect(200);
  const match = await request(app)
    .post("/api/qualifications/match")
    .set(auth)
    .expect(200);
  assert.equal(match.body.qualification.isDemo, true);
  const questionList = await request(app)
    .get("/api/self-assessment/questions/demo-ele-001")
    .set(auth)
    .expect(200);
  const submitted = await request(app)
    .post("/api/self-assessment/submit")
    .set(auth)
    .send({
      responses: questionList.body.map((q: { id: string }, i: number) => ({
        questionId: q.id,
        answer: [0, 1, 2, 3, 0][i],
      })),
    })
    .expect(201);
  assert.equal(submitted.body.selfAssessmentScore, 100);
  console.log(
    "PASS: live Gemini extraction → stored skills → confirmation → demo qualification match → 5-question self-assessment → MongoDB persisted score.",
  );
  console.log(
    JSON.stringify({
      skills: extraction.body.skills,
      matchScore: match.body.matchScore,
      selfAssessmentScore: submitted.body.selfAssessmentScore,
    }),
  );
} finally {
  assert.equal(connection.name, databaseName);
  assert.match(connection.name, /^dakshsetu_test_[a-f0-9]+$/);
  await connection.dropDatabase();
  await connection.close();
}
