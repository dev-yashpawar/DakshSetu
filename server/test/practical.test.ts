import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../src/models.js";
import { seedDatabase } from "../src/services.js";
import { createApp } from "../src/app.js";
import { syntheticVideo } from "./helpers/video.js";
import { videoAnalysisAvailable } from "../src/video.js";
import { rubric } from "../../shared/assessment.js";
import { taskInstructions, timestampLabel } from "../../shared/practical.js";
import { qualification } from "../../shared/data.js";
import { questions } from "../src/questions.js";
import { createPracticalProcessor } from "../src/practical.js";

const dbName = "dakshsetu_test_practical_" + randomUUID().replaceAll("-", "");
let ctx: Awaited<ReturnType<typeof connectDatabase>>, app: ReturnType<typeof createApp>, assessor: Record<string,string>, admin: Record<string,string>, video: Awaited<ReturnType<typeof syntheticVideo>>;
let failAI = false, invalidTimestamp = false, framesReceived = 0;
const ai = { apiKey: "synthetic-test-key", model: "test", fetcher: (async (_url, init) => {
  if(failAI) return new Response("unavailable", { status: 503 });
  const body = JSON.parse(String(init?.body)), text = body.contents[0].parts[0].text;
  const start = text.indexOf('{"frameTimes":'), end = text.indexOf('. Write summary', start);
  const context = JSON.parse(text.slice(start,end));
  framesReceived = body.contents[0].parts.filter((p: any) => p.inlineData).length;
  const result = { observations: rubric.map((r,i) => ({ criterionId: r.id, status: i === 0 ? "warning" : "unclear", confidence: .6, timestamp: invalidTimestamp ? 99999 : context.frameTimes[i % context.frameTimes.length], type: i === 0 ? "safety-critical" : "info", evidence: "Synthetic visible-only observation" })), suggestedScores: rubric.map(r => ({ criterionId: r.id, score: 2, maxScore: 3, reason: "Synthetic limited visibility" })), suggestedScore: 6, maxScore: 10, warnings: ["Synthetic warning"], summary: "Synthetic provider test response — not real AI results", limitations: ["Test pattern; no competence conclusion"] };
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }));
}) as typeof fetch };
before(async () => {
  ctx = await connectDatabase("mongodb://127.0.0.1:27027/" + dbName); await seedDatabase(ctx.models);
  app = createApp(ctx.models, { test: true, jwtSecret: "practical-workflow-test", clientUrls: [], publicAppUrl: "https://dakshsetu.example", ai, imageStorage: { configured: true, upload: async (_b,id) => ({ url: "https://storage.invalid/private/"+id, publicId: id }), remove: async () => {}, uploadVideo: async (_b,id) => ({ url: "https://storage.invalid/private/"+id, publicId: id }), removeVideo: async () => {} } });
  for(const role of ["assessor","admin"]) { const r = await request(app).post("/api/auth/login").send({ email: role + "@dakshsetu.demo", password: "demo123" }).expect(200); const h = { Authorization: "Bearer " + r.body.token }; if(role === "assessor") assessor = h; else admin = h; }
  if(await videoAnalysisAvailable()) video = await syntheticVideo();
});
after(async () => { await video?.cleanup(); if(ctx) { assert.equal(ctx.connection.name, dbName); await ctx.connection.dropDatabase(); await ctx.connection.close(); } });
async function candidate() {
  const r = await request(app).post("/api/auth/register").send({ name: "Synthetic practical worker", email: randomUUID()+"@test.invalid", phone: "9876543210", password: "testpass123", preferredLanguage: "en" }).expect(201);
  const headers = { Authorization: "Bearer " + r.body.token };
  await request(app).post("/api/workers/experience").set(headers).send({ experienceDescription: "I install residential wiring and switches, test circuits and repair electrical faults.", trade: "Electrician", yearsExperience: 8 }).expect(200);
  await request(app).put("/api/workers/skills").set(headers).send({ skills: qualification.skills }).expect(200);
  await request(app).post("/api/qualifications/match").set(headers).expect(200);
  await request(app).post("/api/self-assessment/submit").set(headers).send({ responses: questions.map(q => ({ questionId: q.id, answer: q.correctAnswer })) }).expect(201);
  const a = (await request(app).post("/api/assessments").set(assessor).send({ workerId: r.body.user.id }).expect(201)).body;
  return { headers, a, user: r.body.user };
}
function assignment(a: any, reason = "") { return { baseVersion: a.version, title: "Install and test a basic switchboard.", instructions: taskInstructions, verificationPrompt: `Before starting, say ${a.id} and show your tester to the camera.`, allowImages: true, reason }; }
async function upload(w: Awaited<ReturnType<typeof candidate>>) {
  const id = randomUUID();
  const response = await request(app).post(`/api/assessments/${w.a.id}/videos`).set(w.headers).field("uploadId",id).field("baseVersion",String(w.a.version)).attach("video",video.bytes,{ filename:"synthetic-test-pattern.mp4", contentType:"video/mp4" }).expect(201);
  w.a = response.body.assessment;
  assert.equal(response.body.evidence.taskId, w.a.practicalTask.taskId);
  assert.equal(response.body.evidence.cloudinaryPublicId,undefined);
  assert.equal(response.body.evidence.url,undefined);
  return id;
}
async function waitReviewed(id: string) {
  for(let i = 0; i < 180; i++) { const a = (await request(app).get(`/api/assessments/${id}`).set(assessor).expect(200)).body; if(["COMPLETED","FAILED"].includes(a.practicalWorkflow.aiStatus)) return a; await new Promise(r => setTimeout(r,100)); }
  throw Error("First review did not finish");
}
test("timestamp labels are finite, bounded and deterministic", () => { assert.equal(timestampLabel(42),"00:42"); assert.equal(timestampLabel(318.9),"05:18"); assert.equal(timestampLabel(-1),"00:00"); assert.equal(timestampLabel(NaN),"00:00"); });
test("worker submission → real frame extraction → synthetic AI → human override → signed passport, PDF, public QR and revocation", { timeout: 120000 }, async t => {
  if(!video) return t.skip("FFmpeg/FFprobe are required for real decoding");
  failAI = false; invalidTimestamp = false;
  const w = await candidate(), stranger = await candidate();
  await request(app).post(`/api/practical/${w.a.id}/assign`).set(w.headers).send(assignment(w.a)).expect(403);
  await request(app).get(`/api/practical/${w.a.id}`).set(stranger.headers).expect(403);
  w.a = (await request(app).post(`/api/practical/${w.a.id}/assign`).set(assessor).send(assignment(w.a)).expect(200)).body;
  assert.equal(w.a.practicalTask.candidateId,w.user.id);
  await request(app).post(`/api/practical/${w.a.id}/submit`).set(w.headers).send({ baseVersion:w.a.version }).expect(409);
  const removedId = await upload(w);
  w.a = (await request(app).delete(`/api/practical/${w.a.id}/evidence/${removedId}`).set(w.headers).send({baseVersion:w.a.version}).expect(200)).body;
  const evidenceId = await upload(w);
  await request(app).get(`/api/assessments/${w.a.id}/videos/${evidenceId}/content`).set(stranger.headers).expect(403);
  const scores = rubric.map(r => ({ criterionId:r.id, score:3, remark:"Human observed complete safe procedure", evidenceIds:[evidenceId] }));
  await request(app).put(`/api/assessments/${w.a.id}/practical`).set(assessor).send({baseVersion:w.a.version,rubricScores:scores}).expect(409);
  await request(app).post(`/api/practical/${w.a.id}/submit`).set(w.headers).send({baseVersion:w.a.version}).expect(202);
  await request(app).post(`/api/practical/${w.a.id}/submit`).set(w.headers).send({baseVersion:w.a.version}).expect(200);
  w.a = await waitReviewed(w.a.id);
  assert.equal(w.a.practicalWorkflow.aiStatus,"COMPLETED",`frames=${framesReceived}, rubric=${w.a.rubricVersion}, criteria=${w.a.rubricSnapshot?.length}`); assert.equal(framesReceived,8);
  assert.ok(w.a.aiObservation.observations.every((o:any) => o.timestamp >= 0 && o.timestamp <= 3 && o.timestampLabel));
  assert.equal(w.a.aiObservation.suggestedScores.length,12);
  for(const path of [`/api/practical/${w.a.id}`,`/api/assessments/${w.a.id}`,"/api/workers/me","/api/workers/portal",`/api/assessments/${w.a.id}/videos`]) {
    const r = await request(app).get(path).set(w.headers).expect(200);
    assert.doesNotMatch(JSON.stringify(r.body),/aiSuggestedScore|aiObservation|Synthetic provider|suggestedScores|storage.invalid|cloudinaryPublicId/);
  }
  await request(app).delete(`/api/practical/${w.a.id}/evidence/${evidenceId}`).set(w.headers).send({baseVersion:w.a.version}).expect(423);
  await request(app).post(`/api/assessments/${w.a.id}/videos`).set(w.headers).field("uploadId",randomUUID()).field("baseVersion",String(w.a.version)).attach("video",video.bytes,{filename:"locked.mp4",contentType:"video/mp4"}).expect(423);
  w.a = (await request(app).post(`/api/practical/${w.a.id}/review-start`).set(assessor).send({baseVersion:w.a.version}).expect(200)).body;
  w.a = (await request(app).put(`/api/assessments/${w.a.id}/practical`).set(assessor).send({baseVersion:w.a.version,rubricScores:scores}).expect(200)).body;
  await request(app).post(`/api/assessments/${w.a.id}/finalize`).set(w.headers).send({}).expect(403);
  const final = {baseVersion:w.a.version,assessorScore:100,recommendation:"Competent",overrideReason:"",confirmed:true};
  await request(app).post(`/api/assessments/${w.a.id}/finalize`).set(assessor).send(final).expect(400);
  w.a = (await request(app).post(`/api/assessments/${w.a.id}/finalize`).set(assessor).send({...final,overrideReason:"Human reviewed the full video; sampled frames missed successful final testing."}).expect(200)).body;
  assert.equal(w.a.status,"SIGNED_OFF"); assert.equal(w.a.practicalWorkflow.stage,"SIGNED_OFF");
  await request(app).post(`/api/practical/${w.a.id}/assign`).set(assessor).send(assignment(w.a,"Cannot replace completed assessment")).expect(423);
  const p = (await request(app).get(`/api/passports/${w.a.id}`).set(w.headers).expect(200)).body; assert.equal(p.workerName,w.user.name);
  const c = (await request(app).get(`/api/credentials/assessment/${w.a.id}`).set(w.headers).expect(200)).body;
  const credential = c.credential ?? c;
  const verification = (await request(app).get(`/api/credentials/${credential.credentialId}/verify`).expect(200)).body;
  assert.equal(verification.status,"VALID"); assert.equal(verification.credentialStatus,"ACTIVE");
  assert.doesNotMatch(JSON.stringify(verification),/email|phone|cloudinary|aiObservation|workerId|assessorId/);
  const pdf = await request(app).get(`/api/passports/${w.a.id}/pdf`).set(w.headers).expect(200); assert.match(pdf.headers["content-type"],/pdf/);
  await request(app).post(`/api/admin/credentials/${credential.credentialId}/revoke`).set(admin).send({revision:credential.revision,reason:"Synthetic test credential must be revoked"}).expect(200);
  assert.equal((await request(app).get(`/api/credentials/${credential.credentialId}/verify`).expect(200)).body.status,"REVOKED");
  for(const action of ["PRACTICAL_TASK_ASSIGNED","EVIDENCE_SUBMITTED","AI_REVIEW_STARTED","AI_REVIEW_COMPLETED","ASSESSOR_REVIEW_STARTED","ASSESSOR_SCORE_SAVED","AI_SCORE_OVERRIDDEN","ASSESSMENT_SIGNED_OFF","PASSPORT_DOWNLOADED","CREDENTIAL_REVOKED"]) assert.ok(await ctx.models.AuditLog.exists({assessmentId:w.a.id,action}),action);
});
test("AI failure and invalid timestamps allow manual scoring; new submission preserves old evidence and requires an auditable reason", { timeout: 120000 }, async t => {
  if(!video) return t.skip("FFmpeg/FFprobe are required for real decoding");
  for(const invalid of [false,true]) {
    failAI = !invalid; invalidTimestamp = invalid;
    const w = await candidate(); w.a = (await request(app).post(`/api/practical/${w.a.id}/assign`).set(assessor).send(assignment(w.a)).expect(200)).body;
    const oldTask = w.a.practicalTask.taskId, evidenceId = await upload(w);
    await request(app).post(`/api/practical/${w.a.id}/submit`).set(w.headers).send({baseVersion:w.a.version}).expect(202);
    w.a = await waitReviewed(w.a.id); assert.equal(w.a.practicalWorkflow.aiStatus,"FAILED"); assert.equal(w.a.aiObservation,undefined);
    w.a = (await request(app).put(`/api/assessments/${w.a.id}/practical`).set(assessor).send({baseVersion:w.a.version,rubricScores:rubric.map(r=>({criterionId:r.id,score:2,remark:"Manual review despite unavailable AI",evidenceIds:[evidenceId]}))}).expect(200)).body;
    await request(app).post(`/api/practical/${w.a.id}/assign`).set(assessor).send(assignment(w.a)).expect(400);
    w.a = (await request(app).post(`/api/practical/${w.a.id}/assign`).set(assessor).send(assignment(w.a,"Please record the final safety testing clearly")).expect(200)).body;
    assert.notEqual(w.a.practicalTask.taskId,oldTask); assert.equal(w.a.practical,undefined); assert.equal(w.a.practicalWorkflow.submittedAt,undefined);
    assert.ok(await ctx.models.Evidence.exists({id:evidenceId,taskId:oldTask}));
    assert.equal((await request(app).get(`/api/practical/${w.a.id}`).set(w.headers).expect(200)).body.evidence.length,0);
    // Simulate a process restart with an expired durable job lease.
    await ctx.models.Assessment.updateOne({id:w.a.id},{ $set:{ practicalWorkflow:{ stage:"AI_REVIEWING",aiStatus:"RUNNING",submissionId:randomUUID(),submittedAt:new Date().toISOString(),reviewEvidenceId:randomUUID(),submittedEvidenceIds:[],leaseUntil:new Date(0).toISOString() } } });
    await createPracticalProcessor(ctx.models, ai)();
    assert.equal((await ctx.models.Assessment.findOne({id:w.a.id}).lean())!.practicalWorkflow!.aiStatus,"FAILED");
  }
});
