import "fake-indexeddb/auto";
import "../src/locales/register-practical";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { practicalMessages } from "../src/locales/practical";
import { translate, hasTranslation } from "../src/localization";
import { timestampLabel } from "../../shared/practical";

test("new practical workflow copy, instructions and statuses translate into Hindi and Marathi", () => {
  for(const [en] of practicalMessages) {
    assert.ok(hasTranslation(en),en);
    for(const language of ["hi","mr"] as const) { const value = translate(en,language,{id:"DS-TEST-1",count:12,size:10}); assert.notEqual(value,en,en); assert.match(value,/[\u0900-\u097f]/); }
  }
  assert.match(translate("Before starting, say DS-TEST-1 and show your tester to the camera.","mr"),/DS-TEST-1/);
  assert.equal(timestampLabel(318),"05:18");
});
test("private video timestamp buttons seek the same player; worker instructions and submission lock render without exposing AI scores", { timeout:30000 }, async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>",{url:"http://127.0.0.1:5173/worker/evidence"}); const w = dom.window;
  for(const [name,value] of Object.entries({window:w,document:w.document,navigator:w.navigator,localStorage:w.localStorage,sessionStorage:w.sessionStorage,HTMLElement:w.HTMLElement,HTMLInputElement:w.HTMLInputElement,Element:w.Element,Node:w.Node,MutationObserver:w.MutationObserver,CustomEvent:w.CustomEvent,File:w.File,FileReader:w.FileReader,getComputedStyle:w.getComputedStyle.bind(w)})) Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:synthetic-private-media"; URL.revokeObjectURL = () => {};
  const { render,screen,fireEvent,cleanup } = await import("@testing-library/react");
  const { MemoryRouter } = await import("react-router-dom");
  const { SessionProvider } = await import("../src/store/session");
  const { PrivateVideo } = await import("../src/components/VideoReview");
  const { WorkerPractical } = await import("../src/components/PracticalTask");
  const { api } = await import("../src/services/api"); const adapter = api.defaults.adapter;
  const a:any = {id:"assessment-test",workerId:"worker-test",qualificationId:"demo-ele-001",status:"IN_ASSESSMENT",version:3,evidenceIds:["video-test"],history:[],practicalTask:{taskId:"task-test",title:"Install and test a basic switchboard.",instructions:["Show your face before beginning.","Show final testing."],verificationPrompt:"Before starting, say DS-TEST-1 and show your tester to the camera.",allowImages:true},practicalWorkflow:{stage:"ASSESSOR_REVIEW_PENDING",aiStatus:"COMPLETED",submittedAt:new Date().toISOString()}};
  api.defaults.adapter = async config => ({status:200,statusText:"OK",headers:{},config,data:config.url === "/settings/public" ? {languages:["en","hi","mr"],demoEnabled:true} : config.url?.includes("/content") ? new Blob(["synthetic-media"]) : {assessment:a,evidence:[],maxVideoBytes:10485760}});
  const wrapper = (children: React.ReactNode) => <MemoryRouter><SessionProvider>{children}</SessionProvider></MemoryRouter>;
  try {
    render(wrapper(<PrivateVideo assessmentId="assessment-test" evidenceId="video-test" observation={{evidenceId:"video-test",observations:[{criterionId:"ppe",criterion:"Uses appropriate PPE",status:"warning",confidence:.6,timestamp:42,type:"safety-critical",evidence:"PPE not clearly visible"}],warnings:[],suggestedScore:4,maxScore:10,summary:"Synthetic",limitations:["Sampled frames only"],createdAt:new Date().toISOString()}} />));
    const button = await screen.findByRole("button",{name:/00:42/});
    await screen.findByLabelText("Private practical video");
    const player = w.document.querySelector("video")!;
    Object.defineProperty(player,"duration",{value:60,configurable:true}); Object.defineProperty(player,"readyState",{value:1,configurable:true});
    fireEvent.click(button); assert.equal(player.currentTime,42);
    cleanup();
    render(wrapper(<WorkerPractical assessment={a} />));
    await screen.findByText("Evidence submitted. Only your assessor can request a new submission.");
    assert.equal(screen.queryByRole("button",{name:"Submit evidence"}),null);
    assert.equal(screen.queryByRole("button",{name:"Upload evidence"}),null);
    assert.equal(screen.queryByText("AI suggested score"),null);
    assert.ok(screen.getByText("Show final testing."));
  } finally { cleanup(); api.defaults.adapter = adapter; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; w.close(); }
});
