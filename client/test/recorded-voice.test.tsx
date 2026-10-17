import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";

test("recording is previewed before upload, failed transcription retains audio for retry and success appends text once",async()=>{
  const dom=new JSDOM("<html><body></body></html>",{url:"http://127.0.0.1:5173/worker/describe"}),w=dom.window;
  for(const [key,value] of Object.entries({window:w,document:w.document,navigator:w.navigator,localStorage:w.localStorage,sessionStorage:w.sessionStorage,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,MutationObserver:w.MutationObserver,CustomEvent:w.CustomEvent,File:w.File,FormData:w.FormData,getComputedStyle:w.getComputedStyle.bind(w)})) Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  let stopped=0,requests=0,fail=true;
  const track={stop:()=>{stopped++;}},media={getTracks:()=>[track]};
  Object.defineProperty(w.navigator,"mediaDevices",{value:{getUserMedia:async()=>media},configurable:true});
  class Recorder {
    static isTypeSupported(m:string){return m.startsWith("audio/webm");}
    state="inactive";mimeType="audio/webm;codecs=opus";ondataavailable:any;onstop:any;onerror:any;
    start(){this.state="recording";}
    stop(){this.state="inactive";this.ondataavailable?.({data:new w.Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,1,2,3])])});this.onstop?.();}
  }
  Object.defineProperty(globalThis,"MediaRecorder",{value:Recorder,writable:true,configurable:true});
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=()=>"blob:synthetic-audio";URL.revokeObjectURL=()=>{};
  const {render,screen,fireEvent,cleanup,waitFor}=await import("@testing-library/react"),{SessionProvider}=await import("../src/store/session"),{RecordedVoice}=await import("../src/components/RecordedVoice"),{api}=await import("../src/services/api");
  const adapter=api.defaults.adapter,text:string[]=[];
  api.defaults.adapter=async config=>{
    if(config.url==="/voice/transcribe") { requests++;assert.equal((config.data as FormData).get("language"),"en");if(fail)throw Error("Synthetic connection failure");return {status:200,statusText:"OK",headers:{},config,data:{transcript:"I install switches and test circuits."}}; }
    return {status:200,statusText:"OK",headers:{},config,data:{languages:["en","hi","mr"],demoEnabled:true}};
  };
  try {
    render(<SessionProvider><RecordedVoice onText={s=>text.push(s)}/></SessionProvider>);
    fireEvent.click(screen.getByRole("button",{name:"Record audio",exact:true}));
    await screen.findByRole("button",{name:"Stop recording",exact:true});
    fireEvent.click(screen.getByRole("button",{name:"Stop recording",exact:true}));
    await screen.findByLabelText("Listen to your recording");assert.equal(requests,0);assert.equal(stopped,1);
    fireEvent.click(screen.getByRole("button",{name:"Transcribe audio",exact:true}));
    await screen.findByRole("alert");assert.ok(screen.getByLabelText("Listen to your recording"));assert.equal(text.length,0);
    fail=false;fireEvent.click(screen.getByRole("button",{name:"Transcribe audio",exact:true}));
    await waitFor(()=>assert.equal(text.length,1));assert.equal(requests,2);assert.equal(text[0],"I install switches and test circuits.");
    await waitFor(()=>assert.equal(screen.queryAllByLabelText("Listen to your recording").length,0));
  } finally {cleanup();api.defaults.adapter=adapter;URL.createObjectURL=create;URL.revokeObjectURL=revoke;dom.window.close();}
});
