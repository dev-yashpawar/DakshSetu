import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { connectDatabase } from "../src/models.js";
import { seedDatabase } from "../src/services.js";
import { createApp } from "../src/app.js";
import { validateAudio, maxAudioBytes } from "../src/voice.js";

const name = "dakshsetu_test_voice_" + randomUUID().replaceAll("-", "");
let db: Awaited<ReturnType<typeof connectDatabase>>, app: ReturnType<typeof createApp>;
const headers: Record<string, Record<string,string>> = {};
let mode = "success", calls = 0;
const wav = Buffer.alloc(44); wav.write("RIFF"); wav.write("WAVE", 8);
before(async () => {
  db = await connectDatabase("mongodb://127.0.0.1:27027/" + name); await seedDatabase(db.models);
  app = createApp(db.models, {test:true, jwtSecret:"synthetic-voice-test",clientUrls:[],ai:{apiKey:"synthetic-provider-key",model:"test",fetcher:(async (_url, init) => {
    calls++; assert.equal(new Headers(init?.headers).get("x-goog-api-key"),"synthetic-provider-key");
    const body = JSON.parse(String(init?.body)); assert.equal(body.contents[0].parts[1].inlineData.mimeType,"audio/wav");
    assert.match(body.contents[0].parts[0].text,/Hindi/);
    if(mode === "failure") return new Response("quota unavailable",{status:429});
    const text = mode === "empty" ? '{"transcript":""}' : mode === "invalid" ? "not JSON" : '{"transcript":"मैं आठ साल से बिजली का काम करता हूँ।"}';
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text}]}}]}));
  }) as typeof fetch}});
  for(const role of ["worker","assessor","admin"]) { const r = await request(app).post("/api/auth/login").send({email:role+"@dakshsetu.demo",password:"demo123"}).expect(200);headers[role]={Authorization:"Bearer "+r.body.token}; }
});
after(async () => { if(db) {assert.equal(db.connection.name,name);await db.connection.dropDatabase();await db.connection.close();} });
test("recorded voice requires authentication, accepts workers/assessors and returns only an editable transcript without saving audio",async()=>{
  await request(app).post("/api/voice/transcribe").expect(401);
  await request(app).post("/api/voice/transcribe").set(headers.admin).expect(403);
  for(const role of ["worker","assessor"]) {
    mode="success";
    const r = await request(app).post("/api/voice/transcribe").set(headers[role]).field("language","hi").attach("audio",wav,{filename:"test.wav",contentType:"audio/wav"}).expect(200);
    assert.deepEqual(Object.keys(r.body),["transcript"]); assert.match(r.body.transcript,/आठ/); assert.match(r.headers["cache-control"],/no-store/);
  }
  assert.equal(await db.models.Evidence.countDocuments(),0);
  const profile = await db.models.Profile.findOne().lean(); assert.equal(profile?.experienceDescription,"");
});
test("recorded voice rejects forged/oversized audio and unsupported languages before calling the provider",async()=>{
  const count=calls;
  await request(app).post("/api/voice/transcribe").set(headers.worker).field("language","hi").attach("audio",Buffer.from("forged"),{filename:"fake.wav",contentType:"audio/wav"}).expect(415);
  await request(app).post("/api/voice/transcribe").set(headers.worker).field("language","xx").attach("audio",wav,{filename:"test.wav",contentType:"audio/wav"}).expect(400);
  await request(app).post("/api/voice/transcribe").set(headers.worker).field("language","hi").attach("audio",Buffer.alloc(maxAudioBytes+1),{filename:"large.wav",contentType:"audio/wav"}).expect(413);
  assert.equal(calls,count);
  assert.equal(validateAudio(Buffer.from([0x1a,0x45,0xdf,0xa3]),"audio/webm;codecs=opus"),"audio/webm");
});
test("transcription failure and invalid output never invent text; silence has a distinct retryable response",async()=>{
  for(const [state,status] of [["failure",503],["invalid",503],["empty",422]] as const) {
    mode=state;
    const r=await request(app).post("/api/voice/transcribe").set(headers.worker).field("language","hi").attach("audio",wav,{filename:"test.wav",contentType:"audio/wav"}).expect(status);
    assert.equal(r.body.transcript,undefined); assert.doesNotMatch(JSON.stringify(r.body),/synthetic-provider-key|quota unavailable/);
  }
});
