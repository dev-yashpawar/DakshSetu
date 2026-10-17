import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { connectDatabase } from "../src/models.js";
import { seedDatabase } from "../src/services.js";
import { createApp } from "../src/app.js";
import {
  rubric,
  calculateFinal,
  calculatePractical,
  suggestedRecommendation,
} from "../../shared/assessment.js";
import { questions } from "../src/questions.js";
const dbName = "dakshsetu_test_manage_" + randomUUID().replaceAll("-", "");
let ctx: Awaited<ReturnType<typeof connectDatabase>>,
  app: ReturnType<typeof createApp>,
  admin: Record<string, string>,
  assessor: Record<string, string>,
  assessorId: string;
const login = async (email: string, password = "demo123") =>
  (
    await request(app)
      .post("/api/auth/login")
      .send({ email, password })
      .expect(200)
  ).body;
const header = (token: string) => ({ Authorization: "Bearer " + token });
before(async () => {
  ctx = await connectDatabase("mongodb://127.0.0.1:27027/" + dbName);
  await seedDatabase(ctx.models);
  app = createApp(ctx.models, {
    jwtSecret: "management-test-secret",
    clientUrls: [],
    test: true,
    publicAppUrl: "https://dakshsetu.example",
    ai: { apiKey: "", model: "test" },
    imageStorage: {
      configured: true,
      async upload(_b, id) {
        return { url: "https://test.invalid/" + id, publicId: id };
      },
      async remove() {},
      async uploadVideo(_b, id) {
        return { url: "https://test.invalid/" + id, publicId: id };
      },
      async removeVideo() {},
    },
  });
  admin = header((await login("admin@dakshsetu.demo")).token);
  const a = await login("assessor@dakshsetu.demo");
  assessor = header(a.token);
  assessorId = a.user.id;
});
after(async () => {
  if (ctx) {
    assert.equal(ctx.connection.name, dbName);
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  }
});
async function worker() {
  const email = randomUUID() + "@test.invalid";
  const r = (
    await request(app)
      .post("/api/auth/register")
      .send({
        name: "Synthetic worker",
        email,
        phone: "9876543210",
        password: "test-password-123",
        preferredLanguage: "en",
      })
      .expect(201)
  ).body;
  return { ...r, headers: header(r.token) };
}
test("DigiLocker mock only opens the demo worker and respects disabled demo access", async () => {
  const result = await request(app)
    .post("/api/auth/digilocker/demo")
    .send({})
    .expect(200);
  assert.equal(result.body.user.role, "worker");
  assert.equal(result.body.user.email, "worker@dakshsetu.demo");
  assert.equal(result.body.demo, true);
  assert.equal(result.body.identityVerified, false);
  await request(app)
    .post("/api/auth/digilocker/demo")
    .send({ role: "admin" })
    .expect(400);
  const lockedApp = createApp(ctx.models, {
    jwtSecret: "test-disabled-demo",
    clientUrls: [],
    test: true,
    allowDemoLogin: false,
    ai: { apiKey: "", model: "test" },
  });
  await request(lockedApp)
    .post("/api/auth/digilocker/demo")
    .send({})
    .expect(403);
  const settings = await ctx.models.SystemSettings.findOne({});
  if (settings) {
    await ctx.models.SystemSettings.updateOne(
      { _id: settings._id },
      { $set: { demoEnabled: false } },
    );
    try {
      await request(app).post("/api/auth/digilocker/demo").send({}).expect(403);
    } finally {
      await ctx.models.SystemSettings.updateOne(
        { _id: settings._id },
        { $set: { demoEnabled: settings.demoEnabled } },
      );
    }
  }
});
test("Role-specific login rejects every cross-role combination without issuing a token", async () => {
  for (const account of ["worker", "assessor", "admin"]) {
    for (const portal of ["worker", "assessor", "admin"]) {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: account + "@dakshsetu.demo",
          password: "demo123",
          role: portal,
        });
      assert.equal(response.status, account === portal ? 200 : 401);
      if (account === portal) assert.equal(response.body.user.role, portal);
      else assert.equal(response.body.token, undefined);
    }
  }
  await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@dakshsetu.demo", password: "demo123", role: "owner" })
    .expect(400);
});
async function journey() {
  const w = await worker();
  await request(app)
    .put("/api/workers/me")
    .set(w.headers)
    .send({ trade: "Electrician", yearsExperience: 8 })
    .expect(200);
  await request(app)
    .post("/api/workers/experience")
    .set(w.headers)
    .send({
      trade: "Electrician",
      yearsExperience: 8,
      experienceDescription:
        "I install house wiring and switches for eight years.",
    })
    .expect(200);
  await request(app)
    .put("/api/workers/skills")
    .set(w.headers)
    .send({ skills: ["Residential Wiring", "Switch Installation"] })
    .expect(200);
  const match = (
    await request(app)
      .post("/api/qualifications/match")
      .set(w.headers)
      .expect(200)
  ).body;
  const a = (
    await request(app)
      .post("/api/self-assessment/submit")
      .set(w.headers)
      .send({
        qualificationId: match.qualification.id,
        responses: questions.map((q) => ({
          questionId: q.id,
          answer: q.correctAnswer,
        })),
      })
      .expect(201)
  ).body;
  return { ...w, assessment: a };
}
test("Admin creates accounts; deactivation invalidates existing sessions; role changes and protected routes persist with audit", async () => {
  const w = await worker();
  await request(app).get("/api/manage/users").set(w.headers).expect(403);
  await request(app).get("/api/manage/settings").set(assessor).expect(403);
  await request(app).get("/api/manage/users").expect(401);
  const email = randomUUID() + "@test.invalid",
    body = {
      name: "Managed account",
      email,
      phone: "9876543210",
      password: "strong-managed-123",
      role: "worker",
      preferredLanguage: "mr",
    };
  const u = (
    await request(app)
      .post("/api/manage/users")
      .set(admin)
      .send(body)
      .expect(201)
  ).body;
  assert.equal(u.passwordHash, undefined);
  assert.equal(await ctx.models.Profile.countDocuments({ userId: u.id }), 1);
  const old = await login(email, body.password);
  await request(app)
    .patch("/api/manage/users/" + u.id)
    .set(admin)
    .send({
      baseVersion: 0,
      role: "assessor",
      accountStatus: "INACTIVE",
      reason: "Disable synthetic test account.",
    })
    .expect(200);
  await request(app).get("/api/auth/me").set(header(old.token)).expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email, password: body.password })
    .expect(401);
  await request(app)
    .patch("/api/manage/users/" + u.id)
    .set(admin)
    .send({
      baseVersion: 0,
      role: "worker",
      accountStatus: "ACTIVE",
      reason: "Stale account update should fail.",
    })
    .expect(409);
  await request(app)
    .patch("/api/manage/users/" + u.id)
    .set(admin)
    .send({
      baseVersion: 1,
      role: "assessor",
      accountStatus: "ACTIVE",
      reason: "Reactivate for assessor management test.",
    })
    .expect(200);
  const fresh = await login(email, body.password);
  assert.equal(fresh.user.role, "assessor");
  await request(app)
    .get("/api/admin/stats")
    .set(header(fresh.token))
    .expect(403);
  assert.equal(
    await ctx.models.AuditLog.countDocuments({
      action: "USER_ACCESS_CHANGED",
      "metadata.userId": u.id,
    }),
    2,
  );
  const me = (await request(app).get("/api/auth/me").set(admin)).body;
  await request(app)
    .patch("/api/manage/users/" + me.id)
    .set(admin)
    .send({
      baseVersion: 0,
      role: "worker",
      accountStatus: "INACTIVE",
      reason: "Cannot disable the current administrator.",
    })
    .expect(409);
});
test("Assignment, reassignment, schedule and batch filtering use versions, record reasons and preserve scores", async () => {
  const w = await journey(),
    a = w.assessment;
  const assigned = (
    await request(app)
      .post("/api/manage/assessments/" + a.id + "/assign")
      .set(admin)
      .send({
        baseVersion: a.version,
        assessorId,
        batch: "SIH synthetic batch",
        scheduledAt: "2026-11-01T10:00:00.000Z",
        reason: "Assign the candidate for supervised evaluation.",
      })
      .expect(200)
  ).body;
  assert.equal(assigned.assessorId, assessorId);
  assert.equal(assigned.selfAssessmentScore, 100);
  assert.equal(assigned.status, "SELF_ASSESSED");
  const begun = (
    await request(app)
      .post("/api/assessments")
      .set(assessor)
      .send({ workerId: w.user.id })
      .expect(201)
  ).body;
  assert.equal(begun.status, "IN_ASSESSMENT");
  await request(app)
    .post("/api/manage/assessments/" + a.id + "/assign")
    .set(admin)
    .send({
      baseVersion: 0,
      assessorId,
      reason: "A stale assignment cannot overwrite the latest.",
    })
    .expect(409);
  const own = (
    await request(app)
      .get("/api/assessor/candidates/" + w.user.id)
      .set(assessor)
      .expect(200)
  ).body;
  assert.equal(own.assessment.batch, "SIH synthetic batch");
  const workload = (
    await request(app).get("/api/manage/assessors").set(admin).expect(200)
  ).body.find((r: any) => r.id === assessorId);
  assert.ok(workload.inProgress >= 1);
  await request(app)
    .patch("/api/manage/users/" + assessorId)
    .set(admin)
    .send({
      baseVersion: 0,
      role: "assessor",
      accountStatus: "INACTIVE",
      reason: "Cannot deactivate until work is reassigned.",
    })
    .expect(409);
  const filtered = (
    await request(app)
      .get("/api/manage/assessments")
      .query({ batch: "SIH synthetic batch" })
      .set(admin)
      .expect(200)
  ).body;
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].responses, undefined);
  const batches = (
    await request(app).get("/api/manage/batches").set(admin).expect(200)
  ).body.items;
  assert.equal(
    batches.find((b: any) => b.batch === "SIH synthetic batch").inProgress,
    1,
  );
  await ctx.models.Assessment.updateOne(
    { id: a.id },
    { $set: { status: "SIGNED_OFF" } },
  );
  await request(app)
    .post("/api/manage/assessments/" + a.id + "/assign")
    .set(admin)
    .send({
      baseVersion: assigned.version,
      assessorId,
      reason: "Signed-off assessments must never be reassigned.",
    })
    .expect(423);
});
test("Qualification CRUD, immutable rubric versions and new-assessment policy snapshots do not rewrite existing assessments", async () => {
  const first = await journey();
  const before = await ctx.models.Assessment.findOne({
    id: first.assessment.id,
  }).lean();
  const q = (
    await request(app)
      .post("/api/manage/qualifications")
      .set(admin)
      .send({
        title: "Synthetic electrical qualification",
        code: "DEMO-TEST-" + randomUUID().slice(0, 8),
        nsqfLevel: 3,
        sector: "Power",
        skills: ["Residential Wiring", "Switch Installation"],
        tasks: ["Install and test a basic switchboard."],
        nos: ["Synthetic safety NOS"],
        isDemo: true,
        trade: "Electrician",
        active: true,
        sourceUrl: "",
      })
      .expect(201)
  ).body;
  const criteria = rubric.map((r) => ({ ...r }));
  criteria[0].weight = 10;
  criteria[4].weight = 15;
  const rev = (
    await request(app)
      .post("/api/manage/qualifications/" + q.id + "/rubrics")
      .set(admin)
      .send({
        taskTitle: "Synthetic switchboard task with saved weights.",
        criteria,
      })
      .expect(201)
  ).body;
  assert.equal(rev.version, 1);
  await request(app)
    .post("/api/manage/qualifications/" + q.id + "/rubrics")
    .set(admin)
    .send({
      taskTitle: "Invalid weighted task",
      criteria: criteria.map((r) => ({ ...r, weight: 1 })),
    })
    .expect(400);
  let s = (
    await request(app).get("/api/manage/settings").set(admin).expect(200)
  ).body;
  const settings = {
    baseVersion: s.version,
    languages: ["en", "hi", "mr"],
    demoEnabled: true,
    activeQualificationId: q.id,
    policy: {
      selfWeight: 0.4,
      practicalWeight: 0.6,
      competent: 80,
      minorGap: 65,
      furtherAssessment: 40,
    },
    reason: "Use versioned scoring for new synthetic assessments.",
  };
  await request(app)
    .put("/api/manage/settings")
    .set(admin)
    .send(settings)
    .expect(200);
  const second = await journey();
  assert.equal(second.assessment.qualificationId, q.id);
  assert.equal(second.assessment.scoringPolicy.selfWeight, 0.4);
  assert.deepEqual(second.assessment.rubricSnapshot, criteria);
  assert.equal(second.assessment.qualificationSnapshot.title, q.title);
  const after = await ctx.models.Assessment.findOne({
    id: first.assessment.id,
  }).lean();
  assert.deepEqual(after, before);
  assert.equal(calculateFinal(80, 90, second.assessment.scoringPolicy), 86);
  assert.equal(
    suggestedRecommendation(35, second.assessment.scoringPolicy),
    "Not yet competent",
  );
  assert.equal(
    calculatePractical(
      criteria.map((c) => ({
        criterionId: c.id,
        score: c.id === "power" ? 0 : 3,
        remark: "",
      })),
      2,
      criteria,
    ),
    90,
  );
  await request(app)
    .put("/api/manage/qualifications/" + q.id)
    .set(admin)
    .send({
      ...q,
      _id: undefined,
      id: undefined,
      revision: undefined,
      baseVersion: 0,
      title: "Updated prototype title",
    })
    .expect(200);
  const saved = await ctx.models.Assessment.findOne({
    id: second.assessment.id,
  }).lean();
  assert.equal(
    saved!.qualificationSnapshot!.title,
    "Synthetic electrical qualification",
  );
  s = (await request(app).get("/api/manage/settings").set(admin)).body;
  await request(app)
    .put("/api/manage/settings")
    .set(admin)
    .send({
      ...settings,
      baseVersion: s.version,
      activeQualificationId: "demo-ele-001",
      policy: {
        selfWeight: 0.3,
        practicalWeight: 0.7,
        competent: 75,
        minorGap: 60,
        furtherAssessment: 40,
      },
    })
    .expect(200);
});
test("Calibration assignments hide reference data and deny unassigned submissions; admin sees benchmark deviation", async () => {
  const sample = (
    await request(app)
      .post("/api/admin/calibration/cases")
      .set(admin)
      .send({
        title: "Assigned synthetic safety practice",
        description:
          "A synthetic supervised safety scenario for calibration testing only.",
        referenceScores: rubric.map((r) => ({ criterionId: r.id, score: 3 })),
      })
      .expect(201)
  ).body;
  const other = await request(app)
    .post("/api/manage/users")
    .set(admin)
    .send({
      name: "Other synthetic assessor",
      email: randomUUID() + "@test.invalid",
      phone: "9876543210",
      password: "strong-other-123",
      role: "assessor",
      preferredLanguage: "en",
    })
    .expect(201);
  await request(app)
    .put("/api/manage/calibration/" + sample.id + "/assign")
    .set(admin)
    .send({ assessorIds: [other.body.id] })
    .expect(200);
  const hidden = (
    await request(app).get("/api/calibration/cases").set(assessor).expect(200)
  ).body;
  assert.ok(!hidden.some((c: any) => c.id === sample.id));
  await request(app)
    .post("/api/calibration/cases/" + sample.id + "/score")
    .set(assessor)
    .send({ scores: rubric.map((r) => ({ criterionId: r.id, score: 2 })) })
    .expect(403);
  await request(app)
    .put("/api/manage/calibration/" + sample.id + "/assign")
    .set(admin)
    .send({ assessorIds: [assessorId] })
    .expect(200);
  const shown = (
    await request(app).get("/api/calibration/cases").set(assessor)
  ).body.find((c: any) => c.id === sample.id);
  assert.equal(shown.referenceScores, undefined);
  await request(app)
    .post("/api/calibration/cases/" + sample.id + "/score")
    .set(assessor)
    .send({ scores: rubric.map((r) => ({ criterionId: r.id, score: 2 })) })
    .expect(200);
  const results = (
    await request(app).get("/api/manage/calibration").set(admin)
  ).body.scores.find((s: any) => s.caseId === sample.id);
  assert.equal(results.reference, 100);
  assert.equal(results.score, 67);
  assert.equal(results.deviation, -33);
});
test("Worker evidence upload and previews are private; workers cannot score, request AI analysis or sign off", async () => {
  const w = await journey(),
    other = await worker(),
    a = w.assessment,
    bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#123456" },
    })
      .png()
      .toBuffer(),
    uploadId = randomUUID(),
    path = "/api/assessments/" + a.id;
  await request(app)
    .post(path + "/media-intents")
    .set(w.headers)
    .send({
      id: uploadId,
      type: "image",
      mimeType: "image/png",
      filename: "synthetic.png",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    .expect(200);
  await request(app)
    .post(path + "/evidence")
    .set(w.headers)
    .field("uploadId", uploadId)
    .field("baseVersion", a.version)
    .attach("image", bytes, {
      filename: "synthetic.png",
      contentType: "image/png",
    })
    .expect(201);
  await request(app)
    .get(path + "/evidence/" + uploadId + "/content")
    .set(w.headers)
    .expect(200);
  await request(app)
    .get(path + "/evidence/" + uploadId + "/content")
    .set(other.headers)
    .expect(403);
  await request(app)
    .put(path + "/practical")
    .set(w.headers)
    .send({ baseVersion: 1, rubricScores: [] })
    .expect(403);
  await request(app)
    .post(path + "/videos/" + randomUUID() + "/analyse")
    .set(w.headers)
    .send({ baseVersion: 1 })
    .expect(403);
  await request(app)
    .post(path + "/finalize")
    .set(w.headers)
    .send({})
    .expect(403);
  await request(app)
    .put("/api/workers/account")
    .set(w.headers)
    .send({
      name: "Updated worker",
      phone: "9876543210",
      state: "Maharashtra",
      district: "Pune",
    })
    .expect(200);
  const me = (await request(app).get("/api/workers/me").set(w.headers)).body;
  assert.equal(me.profile.district, "Pune");
  assert.equal(me.user.name, "Updated worker");
});
test("Declaration queue sync is persistent, idempotent, conflict-aware and rejected after self-assessment", async () => {
  const w = await worker(),
    p = (await request(app).get("/api/workers/me").set(w.headers)).body.profile,
    id = randomUUID(),
    payload = {
      baseVersion: p.version,
      trade: "Electrician",
      yearsExperience: 8,
      experienceDescription:
        "I install residential electrical wiring and repair switches.",
      declarationSource: "voice",
    };
  const send = (x: any) =>
    request(app)
      .post("/api/sync")
      .set(w.headers)
      .send({
        items: [{ id, type: "declaration", resourceId: p.id, payload: x }],
      })
      .expect(200);
  const first = (await send(payload)).body.results[0];
  assert.equal(first.status, "synced");
  assert.equal(first.data.status, "DECLARED");
  const again = (await send(payload)).body.results[0];
  assert.equal(again.data.version, first.data.version);
  const conflict = (
    await send({
      ...payload,
      experienceDescription:
        "This changed payload must not reuse the mutation identifier.",
    })
  ).body.results[0];
  assert.equal(conflict.status, "conflict");
  const fresh = await journey();
  const f = (await request(app).get("/api/workers/me").set(fresh.headers)).body
    .profile;
  const locked = (
    await request(app)
      .post("/api/sync")
      .set(fresh.headers)
      .send({
        items: [
          {
            id: randomUUID(),
            type: "declaration",
            resourceId: f.id,
            payload: { ...payload, baseVersion: f.version },
          },
        ],
      })
      .expect(200)
  ).body.results[0];
  assert.equal(locked.status, "conflict");
});
test("Sync telemetry, admin retry requests and real analytics exports persist without exposing unsent content", async () => {
  const w = await worker(),
    deviceId = randomUUID();
  await request(app)
    .post("/api/sync/telemetry")
    .set(w.headers)
    .send({ deviceId, pending: 3, failed: 1, conflicts: 1, drafts: 4 })
    .expect(200);
  const data = (
    await request(app).get("/api/manage/sync").set(admin).expect(200)
  ).body.devices.find((d: any) => d.deviceId === deviceId);
  assert.equal(data.actorId, w.user.id);
  assert.equal(data.payload, undefined);
  await request(app)
    .post("/api/manage/sync/" + encodeURIComponent(data.id) + "/retry")
    .set(admin)
    .expect(200);
  const poll = (
    await request(app)
      .post("/api/sync/telemetry")
      .set(w.headers)
      .send({ deviceId, pending: 3, failed: 1, conflicts: 1, drafts: 4 })
      .expect(200)
  ).body;
  assert.ok(poll.retryRequestedAt);
  const stats = (
    await request(app).get("/api/manage/analytics").set(admin).expect(200)
  ).body;
  assert.ok(stats.total > 0);
  assert.ok(Array.isArray(stats.trades));
  assert.equal(stats.assessments, undefined);
  const csv = await request(app)
    .get("/api/manage/reports.csv")
    .set(admin)
    .expect(200);
  assert.match(csv.text, /assessment_id,status,batch/);
  assert.ok(!csv.text.includes("passwordHash"));
  assert.match(csv.headers["cache-control"], /no-store/);
});
test("Human AI review records acceptance, correction or rejection separately, preserves AI output and locks after sign-off", async () => {
  const w = await journey(),
    a = w.assessment;
  const started = (
    await request(app)
      .post("/api/assessments")
      .set(assessor)
      .send({ workerId: w.user.id })
      .expect(201)
  ).body;
  const observation = {
    evidenceId: randomUUID(),
    observations: [],
    warnings: ["Synthetic observation"],
    suggestedScore: 7,
    maxScore: 10,
    summary: "Synthetic visible-only test observation.",
    limitations: ["Not a competence decision."],
    createdAt: new Date().toISOString(),
  };
  await ctx.models.Assessment.updateOne(
    { id: a.id },
    { $set: { aiObservation: observation, aiSuggestedScore: 70 } },
  );
  await request(app)
    .post("/api/assessments/" + a.id + "/ai-review")
    .set(w.headers)
    .send({
      baseVersion: started.version,
      decision: "accepted",
      note: "Workers cannot approve an AI observation.",
    })
    .expect(403);
  const r = (
    await request(app)
      .post("/api/assessments/" + a.id + "/ai-review")
      .set(assessor)
      .send({
        baseVersion: started.version,
        decision: "edited",
        note: "Candidate corrected the terminal after image capture.",
      })
      .expect(200)
  ).body;
  assert.equal(r.aiReview.assessorId, assessorId);
  assert.equal(r.aiReview.decision, "edited");
  assert.equal(r.aiObservation.summary, observation.summary);
  assert.equal(r.aiSuggestedScore, 70);
  assert.ok(
    await ctx.models.AuditLog.exists({
      assessmentId: a.id,
      action: "AI_OBSERVATION_REVIEWED",
    }),
  );
  await ctx.models.Assessment.updateOne(
    { id: a.id },
    { $set: { status: "SIGNED_OFF" } },
  );
  await request(app)
    .post("/api/assessments/" + a.id + "/ai-review")
    .set(assessor)
    .send({
      baseVersion: r.version,
      decision: "rejected",
      note: "A completed assessment cannot be edited.",
    })
    .expect(423);
});
