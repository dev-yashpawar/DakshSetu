import { useEffect, useRef, useState } from "react";
import { timestampLabel } from "../../../shared/practical";
import type {
  Assessment,
  Evidence,
  AIObservation,
} from "../../../shared/types";
import { api, errorMessage } from "../services/api";
import { queueMedia, pendingItems, type SyncItem } from "../services/offline";
import { useSession } from "../store/session";
import { useTranslate } from "../localization";
import { useConnectivity } from "./OfflineStatus";
import { ErrorNotice } from "./common";
export function PrivateVideo({
  assessmentId,
  evidenceId,
  observation,
}: {
  assessmentId: string;
  evidenceId: string;
  observation?: AIObservation;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const [seek, setSeek] = useState<number | null>(null);
  const tr = useTranslate(),
    [source, setSource] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      url = "";
    void api
      .get(`/assessments/${assessmentId}/videos/${evidenceId}/content`, {
        responseType: "blob",
      })
      .then(({ data }) => {
        if (active) {
          url = URL.createObjectURL(data);
          setSource(url);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assessmentId, evidenceId]);
  return (
    <div className={observation ? "practical-review-grid" : "private-video"}>
      <ErrorNotice message={tr(error)} />
      {source && (
        <video
          ref={player}
          onLoadedMetadata={() => { if (seek !== null && player.current) player.current.currentTime = Math.min(seek, player.current.duration || seek); }}
          src={source}
          controls
          preload="metadata"
          aria-label={tr("Private practical video")}
          style={{ maxWidth: "100%", maxHeight: 360 }}
        />
      )}
      {observation && <aside className="timestamp-panel" aria-label={tr("AI timestamps")}>
        <h3>{tr("AI Observation — Suggested Only")}</h3>
        <p>{tr("Human assessor review required")}</p>
        {observation.observations.filter(o => o.timestamp !== undefined).map(o => <button key={o.criterionId} className={`timestamp-observation ${o.type ?? "info"}`} disabled={!source} onClick={() => { const time = o.timestamp!; setSeek(time); if(player.current && player.current.readyState >= 1) player.current.currentTime = Math.min(time, player.current.duration || time); }}>
          <strong>{timestampLabel(o.timestamp!)}</strong><span>{tr(o.criterion)} · {tr(o.type ?? o.status)}<small>{tr(o.evidence || "Not clearly visible")} · {Math.round(o.confidence * 100)}%</small></span>
        </button>)}
      </aside>}
    </div>
  );
}
function VideoDisclosure({
  assessmentId,
  evidenceId,
  observation,
}: {
  assessmentId: string;
  evidenceId: string;
  observation?: AIObservation;
}) {
  const tr = useTranslate(),
    [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{tr("View private video")}</summary>
      {open && (
        <PrivateVideo assessmentId={assessmentId} evidenceId={evidenceId} observation={observation} />
      )}
    </details>
  );
}
export function VideoReview({
  assessment,
  workerId,
  canEdit,
  onUpdated,
}: {
  assessment: Assessment;
  workerId: string;
  canEdit: boolean;
  onUpdated: (assessment: Assessment) => void;
}) {
  const tr = useTranslate(),
    { user } = useSession(),
    online = useConnectivity();
  const [videos, setVideos] = useState<
      (Evidence & {
        analysis?: AIObservation & { frameTimes?: number[]; duration?: number };
      })[]
    >([]),
    [available, setAvailable] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<SyncItem[]>([]);
  const load = async () => {
    try {
      const { data } = await api.get(`/assessments/${assessment.id}/videos`);
      setVideos(assessment.practicalTask ? data.items.filter((e: Evidence) => e.taskId === assessment.practicalTask!.taskId) : data.items);
      setAvailable(data.analysisAvailable);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    void load();
  }, [assessment.id, assessment.version]);
  useEffect(() => {
    let active = true;
    const changed = () => {
      if (user)
        void pendingItems(user.id).then((items) => {
          if (active)
            setPending(
              items.filter(
                (i) =>
                  i.type === "media" &&
                  i.payload.assessmentId === assessment.id,
              ),
            );
        });
    };
    changed();
    window.addEventListener("dakshsetu:offline-change", changed);
    return () => {
      active = false;
      window.removeEventListener("dakshsetu:offline-change", changed);
    };
  }, [user?.id, assessment.id]);
  const upload = async () => {
    if (!file || !user) return;
    setBusy(true);
    setError("");
    try {
      const result = await queueMedia(user.id, assessment, workerId, file);
      setFile(null);
      setNotice(
        result.queued
          ? "Media saved on this device. It will upload when the connection returns."
          : "Video uploaded and saved.",
      );
      if (!result.queued) await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const analyse = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(
        `/assessments/${assessment.id}/videos/${id}/analyse`,
        { baseVersion: assessment.version },
        { timeout: 120000 },
      );
      onUpdated(data.assessment);
      setVideos((rows) =>
        rows.map((v) =>
          v.id === id ? { ...v, analysis: data.video.analysis } : v,
        ),
      );
      setNotice(
        "Video observations saved. Suggested only; the assessor decides.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="workspace-panel video-review">
      <h2>{tr("Video-Assisted Practical Review")}</h2>
      <p>
        {tr(
          "Private MP4 or WebM clips, up to 10 MB. Frame analysis supports up to 60 seconds and 1080p.",
        )}
      </p>
      <ErrorNotice message={tr(error)} />
      {notice && (
        <p className="notice" role="status">
          {tr(notice)}
        </p>
      )}
      {!available && (
        <p className="notice">
          {tr(
            "Frame analysis is not installed on this server. Uploaded clips can be reviewed manually; automatic video observations remain unavailable.",
          )}
        </p>
      )}
      {canEdit && !assessment.practicalTask && (
        <div className="media-upload">
          <label>
            {tr("Choose short practical video")}
            <input
              aria-label={tr("Choose short practical video")}
              type="file"
              accept="video/mp4,video/webm"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError("");
              }}
            />
          </label>
          <button
            className="button"
            disabled={!file || busy}
            onClick={() => void upload()}
          >
            {tr(online ? "Upload video" : "Save video on device")}
          </button>
        </div>
      )}
      {!!pending.length && (
        <div className="notice">
          <h3>{tr("Media waiting to sync")}</h3>
          <ul>
            {pending.map((item) => (
              <li key={item.id}>
                {String(item.payload.filename)} ·{" "}
                {tr(
                  item.status === "conflict"
                    ? "Review the device draft"
                    : item.status === "failed"
                      ? "Unable to sync. Reconnect and try again."
                      : item.status === "syncing"
                        ? "Syncing…"
                        : "changes waiting",
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {videos.map((video) => (
        <article key={video.id} className="video-record">
          <h3>{video.filename}</h3>
          {assessment.practicalTask ? <PrivateVideo assessmentId={assessment.id} evidenceId={video.id} observation={video.id === assessment.practicalWorkflow?.reviewEvidenceId ? assessment.aiObservation : undefined} /> : <VideoDisclosure assessmentId={assessment.id} evidenceId={video.id} observation={video.analysis} />}
          {canEdit && !assessment.practicalTask && (
            <button
              className="button outline"
              disabled={!online || !available || busy}
              onClick={() => void analyse(video.id)}
            >
              {tr("Analyse representative frames")}
            </button>
          )}
          {video.analysis && (
            <div className="ai-limitations">
              <h3>{tr("AI Observation — Suggested Only")}</h3>
              <p>{video.analysis.summary}</p>
              {!!video.analysis.frameTimes?.length && (
                <p>
                  {tr("Sample positions (seconds)")}:{" "}
                  {video.analysis.frameTimes
                    .map((t) =>
                      t.toLocaleString(tr.locale, { maximumFractionDigits: 2 }),
                    )
                    .join(" · ")}
                </p>
              )}
              <p>
                {tr(
                  "Frames may repeat in low-frame-rate clips. Sample positions do not prove actions between frames.",
                )}
              </p>
              <p>
                {tr("AI suggested score")}: {video.analysis.suggestedScore} / 10
              </p>
              {!assessment.practicalTask && <ul>
                {video.analysis.observations.map((o) => (
                  <li key={o.criterionId}>
                    {tr(o.criterion)} · {tr(o.status)} ·{" "}
                    {Math.round(o.confidence * 100)}%
                    {o.evidence && <p>{o.evidence}</p>}
                  </li>
                ))}
              </ul>}
              <ul>
                {[
                  ...video.analysis.warnings,
                  ...video.analysis.limitations,
                ].map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
