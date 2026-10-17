import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslate } from "../localization";
import { useSession } from "../store/session";
import { api, errorMessage } from "../services/api";
import { ErrorNotice, Loading } from "../components/common";
import type { WorkerState } from "../../../shared/types";
import { ReassessmentPanel } from "../components/ReassessmentPanel";
import { WorkerPractical } from "../components/PracticalTask";
export function WorkerPortal({ view }: { view: string }) {
  const tr = useTranslate(),
    { user, authenticate } = useSession();
  const [data, setData] = useState<WorkerState | null>(null),
    [portal, setPortal] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState({
      name: "",
      phone: "",
      state: "",
      district: "",
    });
  const load = async () => {
    setError("");
    try {
      const d = (await api.get<WorkerState>("/workers/me")).data;
      setData(d);
      setForm({
        name: d.user.name,
        phone: d.user.phone,
        state: d.profile.state,
        district: d.profile.district,
      });
      setPortal((await api.get("/workers/portal")).data);

    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    void load();
    const update = () => void load();
    window.addEventListener("dakshsetu:sync-complete", update);
    return () => window.removeEventListener("dakshsetu:sync-complete", update);
  }, [user?.id, view]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <main className="container worker-dashboard">
        <ErrorNotice message={error} />
        {!error && <Loading />}
      </main>
    );
  const a = data.assessment;
  return (
    <main className="container worker-dashboard">
      <div className="section-label">{tr("MY DAKSHSETU")}</div>
      <h1>
        {tr(
          (
            {
              dashboard: "My dashboard",
              profile: "My profile",
              myskills: "My skills",
              passport: "Skill Passport",
              reassessment: "Reassessment",
              evidence: "My practical assessment",
            } as Record<string, string>
          )[view],
        )}
      </h1>
      <ErrorNotice message={error} />
      {notice && (
        <p role="status" className="notice success">
          {notice}
        </p>
      )}
      {view === "dashboard" && (
        <>
          <p className="worker-greeting">{data.user.name}</p>
          <section className="workspace-panel worker-next-step">
            <div className="worker-next-heading">
              <span className="section-label">{tr("NEXT ACTION")}</span>
              <h2>
                {tr(
                  a?.status === "SIGNED_OFF"
                    ? "Your result is ready"
                    : a
                      ? "Practical assessment"
                      : "Continue your assessment",
                )}
              </h2>
            </div>
            <p>
              {tr(
                a?.status === "SIGNED_OFF"
                  ? "View your result, verified skills and Skill Passport."
                  : a
                    ? "Your self-assessment is saved. Your practical assessment is the next step."
                    : "Continue your experience declaration and self-assessment.",
              )}
            </p>
            <Link
              className="button"
              to={
                a?.status === "SIGNED_OFF"
                  ? "/passports/" + a.id
                  : a
                    ? "/worker/evidence"
                    : "/worker"
              }
            >
              {tr(
                a?.status === "SIGNED_OFF"
                  ? "View Skill Passport"
                  : a
                    ? "View assessment status"
                    : "Continue",
              )}
            </Link>
            {a && (
              <dl className="worker-appointment">
                <dt>{tr("Assigned assessor")}</dt>
                <dd>{portal?.assessorName || tr("Not assigned yet")}</dd>
                <dt>{tr("Scheduled date")}</dt>
                <dd>
                  {a.scheduledAt
                    ? new Date(a.scheduledAt).toLocaleString(tr.locale)
                    : tr("Not scheduled yet")}
                </dd>
                <dt>{tr("Batch")}</dt>
                <dd>{a.batch || "—"}</dd>
              </dl>
            )}
          </section>
          <div className="stats-grid">
            {[
              ["Current trade", tr(data.profile.trade || "Not selected")],
              ["Experience", data.profile.yearsExperience + " " + tr("years")],
              ["Status", tr(a?.status ?? data.profile.status)],
              ["Self-assessment", a ? tr("Completed") : tr("Pending")],
              [
                "Practical assessment",
                tr(
                  a?.status === "SIGNED_OFF"
                    ? "Completed"
                    : a?.status === "IN_ASSESSMENT"
                      ? "In progress"
                      : "Pending",
                ),
              ],
              [
                "Skill Passport",
                tr(a?.status === "SIGNED_OFF" ? "Available" : "Not generated"),
              ],
            ]
              .filter(([label]) =>
                ["Current trade", "Experience", "Status"].includes(label),
              )
              .map(([label, value]) => (
                <article className="stat-card plain" key={label}>
                  <h2>{tr(label)}</h2>
                  <strong style={{ fontSize: 22 }}>{value}</strong>
                </article>
              ))}
          </div>
        </>
      )}
      {view === "profile" && (
        <form
          className="workspace-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await api.put("/workers/account", form);
              authenticate(r.data, sessionStorage.getItem("dakshsetu-token")!);
              setNotice(tr("Changes saved."));
              await load();
            });
          }}
        >
          <div className="admin-form-grid">
            {[
              ["name", "Full name"],
              ["phone", "Mobile number"],
              ["state", "State"],
              ["district", "District"],
            ].map(([key, label]) => (
              <label className="field" key={key}>
                {tr(label)}
                <input
                  required={key === "name" || key === "phone"}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <button className="button" disabled={busy}>
            {tr("Save changes")}
          </button>
        </form>
      )}
      {view === "myskills" && (
        <section className="workspace-panel">
          <h2>{tr("Confirmed skills")}</h2>
          {data.profile.confirmedSkills.length ? (
            <ul>
              {data.profile.confirmedSkills.map((s) => (
                <li key={s}>{tr(s)}</li>
              ))}
            </ul>
          ) : (
            <p>{tr("Confirm your skills in your assessment journey.")}</p>
          )}
          <Link
            className="button secondary"
            to={a ? "/worker/result" : "/worker"}
          >
            {tr(a ? "View assessment result" : "Continue your assessment")}
          </Link>
        </section>
      )}
      {view === "passport" &&
        (a?.status === "SIGNED_OFF" ? (
          <section className="workspace-panel">
            <p>{tr("Your assessor-verified Skill Passport is ready.")}</p>
            <Link className="button" to={"/passports/" + a.id}>
              {tr("View Skill Passport")}
            </Link>
          </section>
        ) : (
          <section className="workspace-panel">
            <p>
              {tr(
                "Your Skill Passport becomes available after human assessor sign-off.",
              )}
            </p>
            <Link to={a ? "/worker/result" : "/worker"}>
              {tr(a ? "View assessment status" : "Continue your assessment")}
            </Link>
          </section>
        ))}
      {view === "reassessment" &&
        (a?.status === "SIGNED_OFF" ? (
          <ReassessmentPanel assessmentId={a.id} />
        ) : (
          <section className="workspace-panel">
            <p>
              {tr(
                "Targeted reassessment becomes available after your first signed-off result.",
              )}
            </p>
            <Link className="text-button" to={a ? "/worker/result" : "/worker"}>
              {tr(a ? "View assessment status" : "Continue your assessment")}
            </Link>
          </section>
        ))}
      {view === "evidence" && a && <WorkerPractical assessment={a} />}
      {view === "evidence" && !a && <p>{tr("Complete your self-assessment before uploading evidence.")} <Link to="/worker">{tr("Continue your assessment")}</Link></p>}
    </main>
  );
}
