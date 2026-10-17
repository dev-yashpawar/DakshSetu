import { useEffect, useRef, useState } from "react";
import "../locales/register-practical";
import { useSession } from "../store/session";
import { useTranslate } from "../localization";
import { api, errorMessage } from "../services/api";

export function RecordedVoice({ onText, disabled = false, onBusy }: {
  onText: (text: string) => void; disabled?: boolean; onBusy?: (value: boolean) => void;
}) {
  const { language } = useSession(), tr = useTranslate();
  const [recording, setRecording] = useState(false), [starting, setStarting] = useState(false),
    [busy, setBusy] = useState(false), [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""), [error, setError] = useState(""), [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined),
    controller = useRef<AbortController | null>(null), alive = useRef(true),
    callback = useRef(onText), busyCallback = useRef(onBusy);
  callback.current = onText; busyCallback.current = onBusy;
  useEffect(() => { alive.current = true; return () => {
    alive.current = false; clearInterval(timer.current); controller.current?.abort();
    if (recorder.current) { recorder.current.onstop = null; recorder.current.ondataavailable = null; recorder.current.onerror = null; if(recorder.current.state === "recording") recorder.current.stop(); }
    stream.current?.getTracks().forEach(t => t.stop()); busyCallback.current?.(false);
  }; }, []);
  useEffect(() => { if (!file) { setUrl(""); return; } const local = URL.createObjectURL(file); setUrl(local); return () => URL.revokeObjectURL(local); }, [file]);
  const stop = () => { clearInterval(timer.current); if(recorder.current?.state === "recording") recorder.current.stop(); };
  useEffect(() => { if(disabled) { stop(); controller.current?.abort(); } }, [disabled]);
  const start = async () => {
    setStarting(true); setError(""); busyCallback.current?.(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(m => MediaRecorder.isTypeSupported(m));
      if (!mimeType) throw Error("Unsupported recorder");
      const capture = new MediaRecorder(media, { mimeType, audioBitsPerSecond: 64000 });
      recorder.current = capture; const chunks: Blob[] = []; let bytes = 0, elapsed = 0;
      capture.ondataavailable = e => { if(e.data.size) chunks.push(e.data); bytes += e.data.size; if(bytes > 5 * 1024 * 1024) stop(); };
      capture.onstop = () => {
        clearInterval(timer.current); media.getTracks().forEach(t => t.stop());
        if (!alive.current) return;
        setRecording(false); busyCallback.current?.(false);
        if(bytes > 5 * 1024 * 1024) { setError("Choose an audio recording smaller than 5 MB."); return; }
        if (!bytes) { setError("No clear speech was detected. Listen to your recording and try again."); return; }
        const mime = capture.mimeType.split(";")[0], extension = mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : "webm";
        setFile(new File(chunks, `voice.${extension}`, { type: mime }));
      };
      capture.onerror = () => { stop(); setError("Audio recording failed. Try again or choose an audio file."); };
      capture.start(500); setFile(null); setSeconds(0); setRecording(true);
      timer.current = setInterval(() => { setSeconds(++elapsed); if(elapsed >= 120) stop(); }, 1000);
    } catch (e) {
      stream.current?.getTracks().forEach(t => t.stop()); busyCallback.current?.(false);
      if(alive.current) setError((e as {name?:string})?.name === "NotAllowedError" ? "Microphone access was denied. Allow microphone access in your browser and try again." : "Audio recording failed. Try again or choose an audio file.");
    } finally { if(alive.current) setStarting(false); }
  };
  const transcribe = async () => {
    if (!file || disabled || busy) return;
    setBusy(true); setError(""); busyCallback.current?.(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const body = new FormData(); body.append("audio", file); body.append("language", language);
      const { data } = await api.post("/voice/transcribe", body, { timeout: 60000, signal: abort.signal });
      if(alive.current && !abort.signal.aborted) { callback.current(data.transcript); setFile(null); }
    } catch (e) { if(alive.current && !abort.signal.aborted) setError(errorMessage(e)); }
    finally { if(alive.current) { setBusy(false); busyCallback.current?.(false); } }
  };
  return <section className="recorded-voice" aria-label={tr("Recorded voice input")}>
    <h3>{tr("Record audio instead")}</h3>
    <p>{tr("Record, listen, then transcribe. Audio is sent to Gemini only when you choose Transcribe audio.")}</p>
    <div className="recorded-voice-actions">
      {typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && <button type="button" className="button outline" disabled={disabled || busy || starting} onClick={() => recording ? stop() : void start()}>{tr(recording ? "Stop recording" : "Record audio")}</button>}
      {recording && <span role="status">{tr("Recording")} · {seconds}s / 120s</span>}
      {!recording && <label className="text-button">{tr("Choose audio file")}<input type="file" accept="audio/webm,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg" disabled={disabled || busy || starting} onChange={e => { const chosen = e.target.files?.[0]; if(!chosen) return; setError(""); if(chosen.size > 5*1024*1024) setError("Choose an audio recording smaller than 5 MB."); else setFile(chosen); e.target.value = ""; }} /></label>}
    </div>
    {file && url && <><audio src={url} controls aria-label={tr("Listen to your recording")} /><a href={url} download={file.name}>{tr("Download recording")}</a></>}
    {file && <button type="button" className="button" disabled={disabled || busy || recording || starting} onClick={() => void transcribe()}>{tr(busy ? "Transcribing audio…" : "Transcribe audio")}</button>}
    {error && <p className="notice" role="alert">{tr(error)}</p>}
  </section>;
}
