import { useEffect, useRef, useState } from "react";
import "../locales/register-practical";
import { useSession } from "../store/session";
import { useTranslate } from "../localization";
import { createSpeechCapture, speechConstructor, type SpeechCapture } from "../services/speech";
import { RecordedVoice } from "./RecordedVoice";
export function VoiceNote({disabled,onText}:{disabled:boolean;onText:(text:string)=>void}) {
  const {language}=useSession(),tr=useTranslate();
  const [listening,setListening]=useState(false),[error,setError]=useState("");
  const [recorded,setRecorded]=useState(false);
  const capture=useRef<SpeechCapture|null>(null),callback=useRef(onText);
  callback.current=onText;
  useEffect(()=>()=>capture.current?.abort(),[]);
  useEffect(()=>{capture.current?.abort();setListening(false);},[language]);
  useEffect(()=>{if(disabled)capture.current?.stop();},[disabled]);
  if(recorded) return <RecordedVoice key={language} disabled={disabled} onText={text => callback.current(text)} />;
  return <div><button className="text-button" type="button" disabled={disabled} title={tr("Voice notes depend on browser support. You can always type a remark.")} onClick={()=>{
    if(listening){capture.current?.stop();return;}
    const Constructor=speechConstructor(); if(!Constructor){setRecorded(true);return;}
    setError(""); capture.current?.abort();
    capture.current=createSpeechCapture({Constructor,language:{en:"en-IN",hi:"hi-IN",mr:"mr-IN"}[language],onFinal:text=>callback.current(text),onListening:setListening,onError:message=>{setError(message);if(/could not connect|unavailable for this language|recognition stopped/.test(message))setRecorded(true);}});
    capture.current.start();
  }}>{tr(listening?"Stop voice note":"Speak remark")}</button>{error&&<small role="status">{tr(error)}</small>}</div>;
}
