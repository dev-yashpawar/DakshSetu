import { useEffect, useRef, useState } from "react";
import "../locales/register-practical";
import { Link } from "react-router-dom";
import type { Assessment, Evidence } from "../../../shared/types";
import { taskInstructions, practicalStageLabels } from "../../../shared/practical";
import { practicalTask } from "../../../shared/assessment";
import { api, errorMessage } from "../services/api";
import { pendingItems, queueMedia, retryPending } from "../services/offline";
import { useTranslate } from "../localization";
import { useSession } from "../store/session";
import { useConnectivity } from "./OfflineStatus";
import { ErrorNotice } from "./common";
import { PrivateVideo } from "./VideoReview";

export function PracticalTaskAssignment({ assessment: a, onUpdated, editable }: { assessment: Assessment; onUpdated: (a: Assessment) => void; editable: boolean }) {
  const tr = useTranslate();
  const [title, setTitle] = useState(a.practicalTask?.title ?? practicalTask),
    [instructions, setInstructions] = useState((a.practicalTask?.instructions ?? taskInstructions).join("\n")),
    [due, setDue] = useState(""), [allowImages, setAllowImages] = useState(a.practicalTask?.allowImages ?? true),
    [prompt, setPrompt] = useState(a.practicalTask?.verificationPrompt ?? `Before starting, say ${a.id} and show your tester to the camera.`),
    [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <section className="workspace-panel practical-assignment">
    <div className="section-label">{tr("PRACTICAL TASK")}</div>
    <h2>{tr(a.practicalTask ? "Assigned practical task" : "Assign practical task")}</h2>
    {a.practicalTask && <><strong>{tr(a.practicalTask.title)}</strong><p className="notice">{tr(practicalStageLabels[a.practicalWorkflow?.stage ?? "PRACTICAL_ASSIGNED"])}</p></>}
    <ErrorNotice message={tr(error)} />
    {editable && <details open={!a.practicalTask}><summary>{tr(a.practicalTask ? "Request new submission" : "Task instructions")}</summary>
      <form className="practical-task-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try {
        const { data } = await api.post<Assessment>(`/practical/${a.id}/assign`, { baseVersion: a.version, title, instructions: instructions.split("\n").map(s => s.trim()).filter(Boolean), ...(due ? { dueDate: new Date(due).toISOString() } : {}), verificationPrompt: prompt, allowImages, reason }); onUpdated(data);
      } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>
        <label>{tr("Predefined practical task")}<select value={title === practicalTask ? practicalTask : "custom"} onChange={e => setTitle(e.target.value === "custom" ? "" : e.target.value)}><option value={practicalTask}>{tr(practicalTask)}</option><option value="custom">{tr("Custom task")}</option></select></label>
        <label>{tr("Task title")}<input required minLength={5} maxLength={200} value={tr(title)} onChange={e => setTitle(e.target.value)} /></label>
        <label>{tr("Task instructions")}<textarea required rows={7} value={instructions.split("\n").map(text => tr(text)).join("\n")} onChange={e => setInstructions(e.target.value)} /><small>{tr("One instruction per line.")}</small></label>
        <label>{tr("Due date")}<input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label>
        <label>{tr("Verification prompt")}<textarea required minLength={10} maxLength={500} value={tr(prompt)} onChange={e => setPrompt(e.target.value)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={allowImages} onChange={e => setAllowImages(e.target.checked)} />{tr("Allow supporting images")}</label>
        {(a.practicalTask || a.practical || !!a.evidenceIds.length) && <label>{tr("Reason for new submission")}<textarea required minLength={10} value={reason} onChange={e => setReason(e.target.value)} /></label>}
        <button className="button" disabled={busy}>{tr(busy ? "Saving…" : a.practicalTask ? "Request new submission" : "Assign practical task")}</button>
      </form>
    </details>}
  </section>;
}

function SupportingImage({ assessmentId, evidence }: { assessmentId: string; evidence: Evidence }) {
  const [url, setUrl] = useState(""); const tr = useTranslate();
  useEffect(() => { let live = true, source = ""; const controller = new AbortController();
    void api.get(`/assessments/${assessmentId}/evidence/${evidence.id}/content`, { responseType: "blob", signal: controller.signal }).then(r => { if(live) { source = URL.createObjectURL(r.data); setUrl(source); } }).catch(() => {});
    return () => { live = false; controller.abort(); if(source) URL.revokeObjectURL(source); };
  }, [assessmentId, evidence.id]);
  return url ? <img src={url} alt={tr("Saved evidence")} /> : <p>{tr("Preview unavailable. Reload the assessment to retry.")}</p>;
}
export function WorkerPractical({ assessment: initial }: { assessment: Assessment }) {
  const tr = useTranslate(), { user } = useSession(), online = useConnectivity();
  const [a, setAssessment] = useState(initial), [evidence, setEvidence] = useState<Evidence[]>([]),
    [limit, setLimit] = useState(10 * 1024 * 1024), [error, setError] = useState(""),
    [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [percent, setPercent] = useState(0),
    [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState(""),
    [queued, setQueued] = useState(0), [confirmed, setConfirmed] = useState(false), [recording, setRecording] = useState(false);
  const input = useRef<HTMLInputElement>(null), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), recordTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const load = async () => { try { const { data } = await api.get(`/practical/${initial.id}`); setAssessment(data.assessment); setEvidence(data.evidence); setLimit(data.maxVideoBytes); if(user) setQueued((await pendingItems(user.id)).filter(i => i.type === "media" && i.payload.assessmentId === initial.id).length); } catch(e) { setError(errorMessage(e)); } };
  useEffect(() => { void load(); const synced = () => void load(); const progress = (event: Event) => { const d = (event as CustomEvent).detail; if(d.assessmentId === initial.id) setPercent(d.percent); };
    window.addEventListener("dakshsetu:sync-complete", synced); window.addEventListener("dakshsetu:upload-progress", progress);
    const timer = setInterval(() => { if(navigator.onLine) void load(); }, 5000);
    return () => { clearInterval(timer); window.removeEventListener("dakshsetu:sync-complete", synced); window.removeEventListener("dakshsetu:upload-progress", progress); };
  }, [initial.id, user?.id]);
  useEffect(() => { if(!file) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => () => { clearTimeout(recordTimer.current); recorder.current?.state === "recording" && recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }, []);
  const locked = !!a.practicalWorkflow?.submittedAt || a.status === "SIGNED_OFF";
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); setPercent(0); try { await fn(); } catch(e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const record = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } }, audio: true }); stream.current = media;
      const mimeType = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(m => MediaRecorder.isTypeSupported(m));
      const capture = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 700000 }); recorder.current = capture;
      const chunks: Blob[] = []; let size = 0;
      capture.ondataavailable = e => { chunks.push(e.data); size += e.data.size; if(size > limit && capture.state === "recording") capture.stop(); };
      capture.onstop = () => { clearTimeout(recordTimer.current); const mime = capture.mimeType.startsWith("video/mp4") ? "video/mp4" : "video/webm"; setFile(new File(chunks, `practical-${a.id}.${mime === "video/mp4" ? "mp4" : "webm"}`, { type: mime })); media.getTracks().forEach(t => t.stop()); setRecording(false); };
      capture.start(1000); setRecording(true); recordTimer.current = setTimeout(() => { if(capture.state === "recording") capture.stop(); }, 59000);
    } catch { stream.current?.getTracks().forEach(t => t.stop()); setError("Recording unavailable. Upload a video instead."); }
  };
  return <section className="workspace-panel worker-practical">
    <div className="section-label">{tr("PRACTICAL TASK")}</div><h2>{tr(a.practicalTask?.title ?? "Assigned practical task")}</h2>
    <ErrorNotice message={tr(error)} />{notice && <p className="notice" role="status">{tr(notice)}</p>}
    {!a.practicalTask ? <p>{tr("Wait for your assessor to assign a practical task.")}</p> : <>
      <p className="assessment-status" role="status">{tr(practicalStageLabels[busy ? "EVIDENCE_UPLOADING" : a.practicalWorkflow?.stage ?? "PRACTICAL_ASSIGNED"])}</p>
      <dl className="candidate-facts"><div><dt>{tr("Assessment ID")}</dt><dd className="break-id">{a.id}</dd></div><div><dt>{tr("Qualification")}</dt><dd>{tr(a.qualificationSnapshot?.title ?? a.qualificationId)}</dd></div><div><dt>{tr("Due date")}</dt><dd>{a.practicalTask.dueDate ? new Date(a.practicalTask.dueDate).toLocaleString(tr.locale) : tr("Not scheduled yet")}</dd></div></dl>
      <ol className="practical-instructions">{a.practicalTask.instructions.map((text, i) => <li key={i}>{tr(text)}</li>)}</ol>
      <div className="notice"><strong>{tr("Verification prompt")}</strong><p>{tr(a.practicalTask.verificationPrompt)}</p><small>{tr("Basic evidence integrity support; not a guarantee of authenticity.")}</small></div>
      {!locked && <>
        <p>{tr("Video limit: {size} MB. Frame review supports clips up to 60 seconds and 1080p.", { size: limit / 1024 / 1024 })}</p>
        <label className="field">{tr("Upload practical video or supporting images")}<input ref={input} type="file" accept={a.practicalTask.allowImages ? "video/mp4,video/webm,image/jpeg,image/png,image/webp" : "video/mp4,video/webm"} disabled={busy || recording} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        {typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && <button className="button outline" disabled={busy} onClick={() => recording ? recorder.current?.stop() : void record()}>{tr(recording ? "Stop recording" : "Record Video")}</button>}
        {recording && <p role="status">{tr("Recording… Maximum 59 seconds.")}</p>}
        {preview && (file?.type.startsWith("video/") ? <video controls src={preview} className="practical-player" /> : <img src={preview} className="practical-player" alt={tr("Selected evidence preview")} />)}
        <button className="button" disabled={!file || busy || recording} onClick={() => void run(async () => { if(file!.type.startsWith("video/") && file!.size > limit) throw Error("The video exceeds the configured upload limit."); const result = await queueMedia(user!.id, a, a.workerId, file!); setFile(null); if(input.current) input.current.value = ""; setNotice(result.queued ? "Evidence saved on this device. It will upload after reconnecting." : "Evidence uploaded and saved."); await load(); })}>{tr(online ? "Upload evidence" : "Save evidence on device")}</button>
        {busy && <label>{tr("Uploading")}<progress max={100} value={percent} aria-label={tr("Upload progress")} /> {percent}%</label>}
      </>}
      {!!queued && <p className="notice">{tr("Media waiting to sync")} ({queued}) <button className="text-button" onClick={() => void run(async () => { await retryPending(user!.id); await load(); })}>{tr("Retry sync")}</button></p>}
      <div className="practical-evidence-list">{evidence.map(e => <article className="evidence-card" key={e.id}><h3>{e.filename}</h3>{e.type === "video" ? <PrivateVideo assessmentId={a.id} evidenceId={e.id} /> : <SupportingImage assessmentId={a.id} evidence={e} />}<p>{tr("Saved evidence")}</p>{!locked && <button className="text-button" disabled={busy || !online} onClick={() => void run(async () => { await api.delete(`/practical/${a.id}/evidence/${e.id}`, { data: { baseVersion: a.version } }); await load(); })}>{tr("Remove draft evidence")}</button>}</article>)}</div>
      {!locked && <div className="submission-actions"><label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{tr("I reviewed my evidence. Submission locks these files for assessor review.")}</label><button className="button" disabled={busy || !online || !!queued || !!file || !confirmed || !evidence.some(e => e.type === "video")} onClick={() => void run(async () => { await api.post(`/practical/${a.id}/submit`, { baseVersion: a.version }); await load(); })}>{tr("Submit evidence")}</button></div>}
      {locked && <p className="notice">{tr("Evidence submitted. Only your assessor can request a new submission.")}</p>}
      {a.practicalWorkflow?.aiStatus === "FAILED" && <p className="notice">{tr("AI review unavailable. Continue with manual assessor review.")}</p>}
      {a.status === "SIGNED_OFF" && <div className="worker-final-outcome"><h3>{tr(a.recommendation ?? "Assessor verified")}</h3><p>{tr("Overall competency score")}: <strong>{a.finalScore}%</strong></p><Link className="button" to={`/passports/${a.id}`}>{tr("View Skill Passport")}</Link></div>}
    </>}
  </section>;
}
