import { useEffect, useState } from "react";
import { api, errorMessage } from "../services/api";
import { useSession } from "../store/session";
import { useTranslate } from "../localization";
import { useConnectivity } from "./OfflineStatus";
import { ErrorNotice, Loading } from "./common";
import type { Reassessment, CompetencyRecord } from "../../../shared/advanced";
import { scoreLabels } from "../../../shared/assessment";
export function ReassessmentPanel({ assessmentId }: { assessmentId: string }) {
  const tr = useTranslate(),
    { user } = useSession(),
    online = useConnectivity();
  const [data, setData] = useState<{
      items: Reassessment[];
      weak: CompetencyRecord[];
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setError("");
    try {
      setData(
        (await api.get("/reassessments/assessment/" + assessmentId)).data,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    void load();
  }, [assessmentId]);
  const request = async (key: string) => {
    setBusy(true);
    setError("");
    try {
      await api.post("/reassessments", { assessmentId, competencyKey: key });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={
        "credential-panel reassessment-panel" +
        (data ? " reassessment-ready" : "")
      }
    >
      <h2>{tr("Improve one competency")}</h2>
      <p>
        {tr(
          "Practise with a qualified trainer, then request a focused human reassessment. Your original assessment remains unchanged.",
        )}
      </p>
      <ErrorNotice message={tr(error)} />
      {!online && (
        <p className="notice">
          {tr("Reconnect to request or complete reassessment.")}
        </p>
      )}
      {!data ? (
        error ? (
          <button
            className="button secondary"
            disabled={!online}
            onClick={() => void load()}
          >
            {tr("Try again")}
          </button>
        ) : (
          <Loading />
        )
      ) : (
        <>
          {data.weak.length === 0 && (
            <p>{tr("No competencies below the prototype 75% threshold.")}</p>
          )}
          {user?.role === "worker" &&
            data.weak.map((c) => {
              const pending = data.items.some(
                (r) => r.competencyKey === c.key && r.status === "PENDING",
              );
              return (
                <article className="reassessment-card" key={c.key}>
                  <div>
                    <h3>{tr(c.name)}</h3>
                    <p>
                      {tr("Current competency score")}: {c.score}%
                    </p>
                    <p>
                      {tr("Recommended practice")}:{" "}
                      {tr(
                        "Review this competency with a qualified trainer and gather new practical evidence.",
                      )}
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={pending || busy || !online}
                    onClick={() => void request(c.key)}
                  >
                    {tr(
                      pending
                        ? "Awaiting reassessment"
                        : "Request reassessment",
                    )}
                  </button>
                </article>
              );
            })}
          {data.items
            .filter((r) => r.status === "PENDING")
            .map((r) => (
              <ReassessmentAttempt
                key={r.id + ":" + r.version}
                record={r}
                canScore={user?.role === "assessor"}
                online={online}
                onChange={async () => {
                  await load();
                  window.dispatchEvent(
                    new window.Event("dakshsetu:credential-updated"),
                  );
                }}
              />
            ))}
          {data.items.some((r) => r.status === "COMPLETED") && (
            <p>
              {tr(
                "Completed attempts are recorded in the reassessment history above.",
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
function ReassessmentAttempt({
  record: r,
  canScore,
  online,
  onChange,
}: {
  record: Reassessment;
  canScore: boolean;
  online: boolean;
  onChange: () => Promise<void>;
}) {
  const tr = useTranslate(),
    [score, setScore] = useState(""),
    [remark, setRemark] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <article className="panel reassessment-card">
      <div>
        <h3>{tr(r.competency)}</h3>
        <p>
          {tr("Awaiting reassessment")} · {tr("New evidence images")}:{" "}
          {r.evidenceIds.length}
        </p>
        {canScore ? (
          <>
            <label>
              {tr("Upload new reassessment evidence")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || !online || r.evidenceIds.length >= 3}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  try {
                    const form = new FormData();
                    form.append("uploadId", crypto.randomUUID());
                    form.append("baseVersion", String(r.version));
                    form.append("image", file);
                    await api.post(
                      "/reassessments/" + r.id + "/evidence",
                      form,
                    );
                    await onChange();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <div className="button-row">
              {r.evidenceIds.map((id, i) => (
                <button
                  key={id}
                  className="text-button"
                  disabled={busy || !online}
                  onClick={async () => {
                    try {
                      const blob = (
                        await api.get(
                          "/reassessments/" + r.id + "/evidence/" + id,
                          { responseType: "blob" },
                        )
                      ).data;
                      setPreview(URL.createObjectURL(blob));
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  {tr("View evidence")} {i + 1}
                </button>
              ))}
            </div>
            {preview && (
              <img
                className="reassessment-preview"
                src={preview}
                alt={tr("New reassessment evidence")}
              />
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api.post("/reassessments/" + r.id + "/complete", {
                    baseVersion: r.version,
                    score: Number(score),
                    remark,
                    confirmed,
                  });
                  await onChange();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {tr("Reassessment rating")}
                <select
                  required
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  disabled={busy || !online}
                >
                  <option value="">{tr("Choose a score")}</option>
                  {scoreLabels.map((s, i) => (
                    <option key={i} value={i}>
                      {i} — {tr(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Reassessment observation")}
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  disabled={busy || !online}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy || !online}
                />
                {tr(
                  "I personally assessed this competency using the new evidence.",
                )}
              </label>
              <button
                className="button"
                disabled={
                  busy || !online || !confirmed || r.evidenceIds.length === 0
                }
              >
                {tr("Complete reassessment")}
              </button>
            </form>
          </>
        ) : (
          <p>
            {tr(
              "Your assigned assessor will review new evidence and confirm the result.",
            )}
          </p>
        )}
        <ErrorNotice message={tr(error)} />
      </div>
    </article>
  );
}
