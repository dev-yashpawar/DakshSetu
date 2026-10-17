import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpeechCapture, type BrowserRecognition, type SpeechResultEvent } from "../src/services/speech";
function fixture() {
  class FakeRecognition implements BrowserRecognition {
    static instances: FakeRecognition[] = [];
    lang="";continuous=false;interimResults=false;starts=0;stops=0;aborts=0;
    onresult: ((e:SpeechResultEvent)=>void)|null=null;
    onerror: ((e:{error:string})=>void)|null=null;
    onend: (()=>void)|null=null;
    constructor(){FakeRecognition.instances.push(this);}
    start(){this.starts++;} stop(){this.stops++;} abort(){this.aborts++;}
  }
  const final:string[]=[],interim:string[]=[],errors:string[]=[],listening:boolean[]=[];
  const capture=createSpeechCapture({Constructor:FakeRecognition,language:"mr-IN",onFinal:s=>final.push(s),onInterim:s=>interim.push(s),onListening:s=>listening.push(s),onError:s=>errors.push(s)});
  return {FakeRecognition,capture,final,interim,errors,listening};
}
test("speech keeps listening across browser session endings, shows interim text and commits each final result once",t=>{
  t.mock.timers.enable({apis:["setTimeout"]});const f=fixture();f.capture.start();
  const first=f.FakeRecognition.instances[0];assert.equal(first.lang,"mr-IN");assert.equal(first.continuous,true);assert.equal(first.interimResults,true);
  first.onresult!({resultIndex:0,results:{length:1,0:{isFinal:false,0:{transcript:"मी वायरिंग"}}}});assert.equal(f.interim.at(-1),"मी वायरिंग");assert.equal(f.final.length,0);
  const result={resultIndex:0,results:{length:1,0:{isFinal:true,0:{transcript:"मी वायरिंग करतो"}}}};
  first.onresult!(result);first.onresult!(result);assert.deepEqual(f.final,["मी वायरिंग करतो"]);
  first.onend!();assert.equal(f.listening.at(-1),true);t.mock.timers.tick(300);assert.equal(f.FakeRecognition.instances.length,2);
  const second=f.FakeRecognition.instances[1];second.onresult!({resultIndex:0,results:{length:1,0:{isFinal:false,0:{transcript:"I also test circuits"}}}});
  f.capture.stop();second.onend!();t.mock.timers.tick(1000);assert.equal(f.FakeRecognition.instances.length,2);assert.equal(f.listening.at(-1),false);assert.deepEqual(f.final,["मी वायरिंग करतो","I also test circuits"]);f.capture.abort();
});
test("silence recovers without a permission error, while permission denial stops without repeated prompts",t=>{
  t.mock.timers.enable({apis:["setTimeout"]});const f=fixture();f.capture.start();const first=f.FakeRecognition.instances[0];
  first.onerror!({error:"no-speech"});first.onend!();t.mock.timers.tick(300);assert.equal(f.FakeRecognition.instances.length,2);assert.equal(f.errors.length,0);
  const second=f.FakeRecognition.instances[1];second.onerror!({error:"not-allowed"});second.onend!();t.mock.timers.tick(3000);
  assert.equal(f.FakeRecognition.instances.length,2);assert.equal(f.listening.at(-1),false);assert.match(f.errors[0],/Microphone access was denied/);f.capture.abort();
});
test("network retries are bounded and stopping or unmounting cancels all pending restarts",t=>{
  t.mock.timers.enable({apis:["setTimeout"]});const f=fixture();f.capture.start();
  for(let i=0;i<3;i++){const r=f.FakeRecognition.instances[i];r.onerror!({error:"network"});r.onend!();t.mock.timers.tick(300);}
  assert.equal(f.FakeRecognition.instances.length,3);assert.equal(f.listening.at(-1),false);assert.match(f.errors[0],/internet connection/);f.capture.abort();
  const g=fixture();g.capture.start();g.FakeRecognition.instances[0].onend!();g.capture.abort();t.mock.timers.tick(1000);assert.equal(g.FakeRecognition.instances.length,1);
});
test("microphone sessions have a two-minute bound and a clear restart message",t=>{
  t.mock.timers.enable({apis:["setTimeout"]});const f=fixture();f.capture.start();t.mock.timers.tick(120000);assert.equal(f.FakeRecognition.instances[0].stops,1);assert.equal(f.listening.at(-1),false);assert.match(f.errors[0],/two minutes/);f.capture.abort();
});
