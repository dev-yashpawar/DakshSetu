import {test} from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {JSDOM} from "jsdom";
test("successful form writes show one nonblocking completion notice; failures and upload intents do not",async()=>{
  const dom=new JSDOM("<html><body></body></html>",{url:"http://127.0.0.1:5173/"}),w=dom.window;
  for(const [name,value] of Object.entries({window:w,document:w.document,navigator:w.navigator,localStorage:w.localStorage,sessionStorage:w.sessionStorage,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,MutationObserver:w.MutationObserver,CustomEvent:w.CustomEvent,getComputedStyle:w.getComputedStyle.bind(w)}))Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  const {render,screen,cleanup,act}=await import("@testing-library/react"),{SessionProvider}=await import("../src/store/session"),{SuccessFeedback}=await import("../src/components/SuccessFeedback"),{api}=await import("../src/services/api");
  const original=api.defaults.adapter;
  api.defaults.adapter=async config=>{if(config.url==="/failed")throw Error("Synthetic write failed");return {status:200,statusText:"OK",headers:{},config,data:config.url==="/settings/public"?{languages:["en","hi","mr"],demoEnabled:true}:{}};};
  try{
    render(<SessionProvider><SuccessFeedback/></SessionProvider>);
    await act(async()=>{await api.post("/failed",{}).catch(()=>{});});assert.equal(screen.queryByText("Done"),null);
    await act(async()=>{await api.post("/assessments/test/media-intents",{});});assert.equal(screen.queryByText("Done"),null);
    await act(async()=>{await api.put("/workers/me",{state:"Synthetic"});});assert.ok(screen.getByText("Done"));assert.equal(screen.getByRole("status").getAttribute("aria-live"),"polite");assert.equal(screen.queryByRole("dialog"),null);
    await act(async()=>{await api.put("/workers/me",{state:"Synthetic again"});});assert.equal(screen.getAllByText("Done").length,1);
  }finally{cleanup();api.defaults.adapter=original;w.close();}
});
