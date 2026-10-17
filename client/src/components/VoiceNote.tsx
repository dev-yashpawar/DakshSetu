import { useEffect, useRef, useState } from "react";
import { useSession } from "../store/session";
import { useTranslate } from "../localization";
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
let current: Recognition | undefined;
export function VoiceNote({
  disabled,
  onText,
}: {
  disabled: boolean;
  onText: (text: string) => void;
}) {
  const { language } = useSession(),
    tr = useTranslate(),
    [listening, setListening] = useState(false),
    [failed, setFailed] = useState(false),
    recognition = useRef<Recognition | null>(null),
    callback = useRef(onText);
  callback.current = onText;
  const browser = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    },
    Ctor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  useEffect(
    () => () => {
      const r = recognition.current;
      if (r) {
        r.onend = null;
        r.onerror = null;
        r.onresult = null;
        r.abort();
        if (current === r) current = undefined;
      }
    },
    [],
  );
  return (
    <div>
      <button
        className="text-button"
        type="button"
        disabled={disabled || !Ctor}
        title={tr(
          "Voice notes depend on browser support. You can always type a remark.",
        )}
        onClick={() => {
          if (listening) {
            recognition.current?.stop();
            return;
          }
          if (!Ctor) return;
          current?.abort();
          const r = new Ctor();
          recognition.current = r;
          current = r;
          r.lang = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" }[language];
          r.continuous = false;
          r.interimResults = false;
          r.onresult = (e) => {
            for (let i = e.resultIndex; i < e.results.length; i++)
              if (e.results[i].isFinal)
                callback.current(String(e.results[i][0].transcript));
          };
          r.onend = () => {
            setListening(false);
            if (current === r) current = undefined;
          };
          r.onerror = () => {
            setFailed(true);
            setListening(false);
          };
          try {
            setFailed(false);
            setListening(true);
            r.start();
          } catch {
            setListening(false);
            setFailed(true);
          }
        }}
      >
        {tr(listening ? "Stop voice note" : "Speak remark")}
      </button>
      {failed && (
        <small role="status">
          {tr("Voice note unavailable. Type your remark instead.")}
        </small>
      )}
    </div>
  );
}
