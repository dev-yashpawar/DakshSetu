import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import type { Connection } from "mongoose";
import type { Models } from "../src/models.js";
import { connectDatabase } from "../src/models.js";
import { createApp } from "../src/app.js";
import { seedDatabase, extractSkills, HttpError } from "../src/services.js";
import { matchSkills, qualification } from "../../shared/data.js";
import { questions } from "../src/questions.js";

const databaseName = `dakshsetu_test_${randomUUID().replaceAll("-", "")}`;
const uri =
  (process.env.TEST_MONGODB_BASE_URI || "mongodb://127.0.0.1:27027") +
  "/" +
  databaseName;
let connection: Connection, db: Models, app: Express;
const config = {
  jwtSecret: "test-only-secret-that-is-long-enough-for-jwt",
  clientUrls: ["http://127.0.0.1:5173"],
  ai: { model: "gemini-2.5-flash" },
  test: true,
};
before(async () => {
  ({ connection, models: db } = await connectDatabase(uri));
  await seedDatabase(db);
  app = createApp(db, config);
});
after(async () => {
  if (connection) {
    assert.equal(connection.name, databaseName);
    assert.match(connection.name, /^dakshsetu_test_[a-f0-9]+$/);
    await connection.dropDatabase();
    await connection.close();
  }
});
async function login(email = "worker@dakshsetu.demo") {
  const r = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "demo123" });
  assert.equal(r.status, 200);
  return r.body.token as string;
}
const experience = {
  experienceDescription:
    "I have worked in residential electrical work for 8 years. I do house wiring, install switches, fans and MCBs and repair electrical faults.",
  trade: "Electrician",
  yearsExperience: 8,
};
async function newWorker(name = "Test Worker") {
  const email = `${randomUUID()}@example.test`;
  const r = await request(app).post("/api/auth/register").send({
    name,
    email,
    phone: "9876543210",
    password: "testpass123",
    preferredLanguage: "hi",
  });
  assert.equal(r.status, 201);
  return { token: r.body.token as string, user: r.body.user, email };
}
async function mappedWorker() {
  const u = await newWorker();
  const auth = { Authorization: "Bearer " + u.token };
  await request(app)
    .post("/api/workers/experience")
    .set(auth)
    .send(experience)
    .expect(200);
  await request(app)
    .put("/api/workers/skills")
    .set(auth)
    .send({ skills: qualification.skills.slice(0, 4) })
    .expect(200);
  await request(app).post("/api/qualifications/match").set(auth).expect(200);
  return { auth, ...u };
}

test("Phase 1: MongoDB is connected and seeds are idempotent", async () => {
  const count = await db.User.countDocuments();
  await seedDatabase(db);
  assert.equal(await db.User.countDocuments(), count);
  assert.equal(await db.Qualification.countDocuments(), 1);
  const health = await request(app).get("/api/health").expect(200);
  assert.equal(health.body.storage, "MongoDB");
  assert.equal(health.body.database, "connected");
});
test("Phase 1: registration hashes passwords, creates a profile, and restores a session", async () => {
  const u = await newWorker("Registration Test");
  assert.equal(u.user.passwordHash, undefined);
  assert.equal(u.user.role, "worker");
  assert.equal(u.user.preferredLanguage, "hi");
  const stored = await db.User.findOne({ id: u.user.id })
    .select("+passwordHash")
    .lean();
  assert.match(stored!.passwordHash, /^\$2[ab]\$/);
  assert.notEqual(stored!.passwordHash, "testpass123");
  const me = await request(app)
    .get("/api/auth/me")
    .auth(u.token, { type: "bearer" })
    .expect(200);
  assert.equal(me.body.id, u.user.id);
  assert.equal(me.body.passwordHash, undefined);
  const profile = await request(app)
    .get("/api/workers/me")
    .auth(u.token, { type: "bearer" })
    .expect(200);
  assert.equal(profile.body.profile.status, "REGISTERED");
  assert.equal(profile.body.profile.userId, u.user.id);
  await request(app)
    .post("/api/auth/login")
    .send({ email: u.email.toUpperCase(), password: "testpass123" })
    .expect(200);
});
test("Phase 1: rejects duplicate accounts, invalid inputs, bad credentials, forged sessions and privilege escalation", async () => {
  const u = await newWorker();
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Test",
      email: u.email,
      phone: "9876543210",
      password: "testpass123",
    })
    .expect(409);
  await request(app)
    .post("/api/auth/register")
    .send({ name: "Test", email: "bad", phone: "12", password: "x" })
    .expect(400);
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Test",
      email: "role@example.test",
      phone: "9876543210",
      password: "testpass123",
      role: "admin",
    })
    .expect(400);
  await request(app)
    .post("/api/auth/login")
    .send({ email: u.email, password: "incorrect" })
    .expect(401);
  await request(app).get("/api/workers/me").expect(401);
  await request(app)
    .get("/api/auth/me")
    .auth("forged", { type: "bearer" })
    .expect(401);
  for (const role of ["assessor", "admin"]) {
    const token = await login(`${role}@dakshsetu.demo`);
    await request(app)
      .get("/api/workers/me")
      .auth(token, { type: "bearer" })
      .expect(403);
  }
});
test("Phase 2: language, electrician trade and experience persist in real MongoDB", async () => {
  const u = await newWorker(),
    auth = { Authorization: "Bearer " + u.token };
  await request(app)
    .put("/api/workers/me")
    .set(auth)
    .send({ preferredLanguage: "mr", trade: "Electrician", yearsExperience: 8 })
    .expect(200);
  await request(app)
    .post("/api/workers/experience")
    .set(auth)
    .send(experience)
    .expect(200);
  const saved = await request(app).get("/api/workers/me").set(auth).expect(200);
  assert.equal(saved.body.user.preferredLanguage, "mr");
  assert.equal(saved.body.profile.yearsExperience, 8);
  assert.equal(saved.body.profile.status, "DECLARED");
  assert.equal(
    saved.body.profile.experienceDescription,
    experience.experienceDescription,
  );
  const stored = await db.Profile.findOne({ userId: u.user.id }).lean();
  assert.equal(stored!.trade, "Electrician");
  assert.equal(stored!.experienceDescription, experience.experienceDescription);
  await request(app)
    .put("/api/workers/me")
    .set(auth)
    .send({ trade: "Plumber" })
    .expect(400);
  await request(app)
    .put("/api/workers/me")
    .set(auth)
    .send({ yearsExperience: -1 })
    .expect(400);
  await request(app)
    .put("/api/workers/me")
    .set(auth)
    .send({ userId: "another-worker" })
    .expect(400);
});
test("Phase 3: AI unavailable is explicit; manual skills still complete the flow", async () => {
  const { token } = await newWorker(),
    auth = { Authorization: "Bearer " + token };
  await request(app)
    .post("/api/workers/experience")
    .set(auth)
    .send(experience)
    .expect(200);
  const ai = await request(app)
    .post("/api/ai/extract-skills")
    .set(auth)
    .send(experience)
    .expect(503);
  assert.equal(ai.body.code, "AI_UNAVAILABLE");
  const result = await request(app)
    .put("/api/workers/skills")
    .set(auth)
    .send({
      skills: [
        "Residential Wiring",
        "MCB Installation",
        "Custom Fan Installation",
      ],
    })
    .expect(200);
  assert.deepEqual(result.body.confirmedSkills, [
    "Residential Wiring",
    "MCB Installation",
    "Custom Fan Installation",
  ]);
  await request(app)
    .put("/api/workers/skills")
    .set(auth)
    .send({ skills: [] })
    .expect(400);
});
test("Phase 3: real Gemini transport contract is validated and extracted skills are persisted", async () => {
  let providerCalled = false;
  const fakeFetch: typeof fetch = async (url, init) => {
    providerCalled = true;
    assert.match(
      String(url),
      /generativelanguage.googleapis.com\/v1beta\/models/,
    );
    assert.equal(
      (init!.headers as Record<string, string>)["x-goog-api-key"],
      "test-key",
    );
    assert.match(String(init!.body), /Do not invent safety skills/);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    trade: "Electrician",
                    skills: ["Residential Wiring", "MCB Installation"],
                    summary: "Domestic wiring and MCB installation.",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const aiApp = createApp(db, {
    ...config,
    ai: { apiKey: "test-key", model: "test-model", fetcher: fakeFetch },
  });
  const { token, user } = await newWorker(),
    auth = { Authorization: "Bearer " + token };
  await request(app)
    .post("/api/workers/experience")
    .set(auth)
    .send(experience)
    .expect(200);
  const r = await request(aiApp)
    .post("/api/ai/extract-skills")
    .set(auth)
    .send(experience)
    .expect(200);
  assert.equal(providerCalled, true);
  assert.deepEqual(r.body.skills, ["Residential Wiring", "MCB Installation"]);
  const stored = await db.Profile.findOne({ userId: user.id }).lean();
  assert.deepEqual(stored!.detectedSkills, [
    "Residential Wiring",
    "MCB Installation",
  ]);
});
test("Phase 3: malformed or failed AI responses use the fallback without inventing skills", async () => {
  for (const payload of [
    "not-json",
    JSON.stringify({ trade: "Plumber", skills: ["Invented"], summary: "Bad" }),
  ]) {
    await assert.rejects(
      extractSkills(experience, {
        apiKey: "test-key",
        model: "test",
        fetcher: async () =>
          new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: payload }] } }],
            }),
          ),
      }),
      (e) => e instanceof HttpError && e.status === 503,
    );
  }
  await assert.rejects(
    extractSkills(experience, {
      apiKey: "test-key",
      model: "test",
      fetcher: async () => new Response("", { status: 429 }),
    }),
    (e) => e instanceof HttpError && e.status === 503,
  );
});
test("Phase 4: deterministic matching uses the 60/20/20 demo weights and labels demo data", async () => {
  const r = matchSkills(qualification.skills, 5, "wiring switch test mcb");
  assert.equal(r.matchScore, 100);
  assert.deepEqual(r.gaps, []);
  assert.equal(matchSkills([], 0, "").matchScore, 0);
  const { auth } = await mappedWorker();
  const match = await request(app)
    .post("/api/qualifications/match")
    .set(auth)
    .expect(200);
  assert.equal(match.body.qualification.isDemo, true);
  assert.equal(match.body.qualification.code, "DEMO-ELE-001");
  assert.equal(match.body.matchScore, 75);
  assert.equal(match.body.matchedSkills.length, 4);
  const profile = await request(app)
    .get("/api/workers/me")
    .set(auth)
    .expect(200);
  assert.equal(profile.body.profile.status, "MAPPED");
  assert.equal(profile.body.profile.matchScore, 75);
});
test("Phase 4: changing experience invalidates the previous skills and qualification match", async () => {
  const { auth } = await mappedWorker();
  const r = await request(app)
    .post("/api/workers/experience")
    .set(auth)
    .send({
      ...experience,
      experienceDescription: "I install ceiling fans in homes.",
    })
    .expect(200);
  assert.equal(r.body.selectedQualificationId, "");
  assert.deepEqual(r.body.confirmedSkills, []);
  assert.deepEqual(r.body.detectedSkills, []);
  await request(app)
    .get("/api/self-assessment/questions/demo-ele-001")
    .set(auth)
    .expect(409);
});
test("Phase 5: questions hide answers; complete submission scores 80% and persists", async () => {
  const { auth, user } = await mappedWorker();
  const list = await request(app)
    .get("/api/self-assessment/questions/demo-ele-001")
    .set(auth)
    .expect(200);
  assert.equal(list.body.length, 5);
  assert.ok(
    list.body.every(
      (q: Record<string, unknown>) => q.correctAnswer === undefined,
    ),
  );
  const responses = questions.map((q, i) => ({
    questionId: q.id,
    answer: i === 4 ? 1 : q.correctAnswer,
  }));
  const submitted = await request(app)
    .post("/api/self-assessment/submit")
    .set(auth)
    .send({ responses })
    .expect(201);
  assert.equal(submitted.body.selfAssessmentScore, 80);
  const saved = await db.Assessment.findOne({ workerId: user.id }).lean();
  assert.equal(saved!.selfAssessmentScore, 80);
  assert.equal(saved!.responses.length, 5);
  const state = await request(app).get("/api/workers/me").set(auth).expect(200);
  assert.equal(state.body.profile.status, "SELF_ASSESSED");
  assert.equal(state.body.assessment.id, submitted.body.id);
  const retried = await request(app)
    .post("/api/self-assessment/submit")
    .set(auth)
    .send({ responses })
    .expect(200);
  assert.equal(retried.body.id, submitted.body.id);
  assert.equal(await db.Assessment.countDocuments({ workerId: user.id }), 1);
  await request(app)
    .put("/api/workers/me")
    .set(auth)
    .send({ yearsExperience: 1 })
    .expect(409);
});
test("Phase 5: rejects skipped prerequisites, duplicate questions, unknown questions and out-of-range answers", async () => {
  const { token } = await newWorker(),
    auth = { Authorization: "Bearer " + token };
  await request(app).post("/api/qualifications/match").set(auth).expect(409);
  await request(app)
    .get("/api/self-assessment/questions/demo-ele-001")
    .set(auth)
    .expect(409);
  const responses = questions.map((q) => ({
    questionId: q.id,
    answer: q.correctAnswer,
  }));
  await request(app)
    .post("/api/self-assessment/submit")
    .set(auth)
    .send({ responses })
    .expect(409);
  const mapped = await mappedWorker();
  await request(app)
    .post("/api/self-assessment/submit")
    .set(mapped.auth)
    .send({ responses: [responses[0], responses[0], ...responses.slice(2)] })
    .expect(400);
  await request(app)
    .post("/api/self-assessment/submit")
    .set(mapped.auth)
    .send({
      responses: [{ questionId: "unknown", answer: 0 }, ...responses.slice(1)],
    })
    .expect(400);
  await request(app)
    .post("/api/self-assessment/submit")
    .set(mapped.auth)
    .send({
      responses: [{ questionId: "safety", answer: 10 }, ...responses.slice(1)],
    })
    .expect(400);
});
test("Unknown and unsupported API routes remain unavailable", async () => {
  for (const path of [
    "/api/assessments",
    "/api/unknown-feature",
    "/api/sync",
  ])
    await request(app).get(path).expect(404);
});

test("Phase 1–5: worker data is isolated and survives API reconstruction", async () => {
  const first = await mappedWorker(),
    second = await newWorker();
  const restarted = createApp(db, config);
  const persisted = await request(restarted)
    .get("/api/workers/me")
    .set(first.auth)
    .expect(200);
  assert.equal(persisted.body.profile.status, "MAPPED");
  assert.ok(persisted.body.profile.confirmedSkills.length > 0);
  const isolated = await request(restarted)
    .get("/api/workers/me")
    .auth(second.token, { type: "bearer" })
    .expect(200);
  assert.equal(isolated.body.profile.userId, second.user.id);
  assert.deepEqual(isolated.body.profile.confirmedSkills, []);
  assert.equal(isolated.body.assessment, null);
});

test("Phase 5: client-provided scores are rejected and both score boundaries are calculated on the server", async () => {
  for (const allCorrect of [true, false]) {
    const { auth } = await mappedWorker();
    const responses = questions.map((q) => ({
      questionId: q.id,
      answer: allCorrect ? q.correctAnswer : (q.correctAnswer + 1) % 4,
    }));
    await request(app)
      .post("/api/self-assessment/submit")
      .set(auth)
      .send({ responses, selfAssessmentScore: 100 })
      .expect(400);
    const result = await request(app)
      .post("/api/self-assessment/submit")
      .set(auth)
      .send({ responses })
      .expect(201);
    assert.equal(result.body.selfAssessmentScore, allCorrect ? 100 : 0);
  }
});
