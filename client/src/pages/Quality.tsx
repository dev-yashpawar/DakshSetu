import { PortalSidebar } from "../components/PortalSidebar";
import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../services/api";
import { useTranslate } from "../localization";
import { ErrorNotice, Loading } from "../components/common";
import {
  compareRatings,
  syntheticRatings,
  type Agreement,
} from "../../../shared/consistency";
import type {
  ConsistencyDataset,
  CalibrationCase,
} from "../../../shared/advanced";
import { rubric, scoreLabels } from "../../../shared/assessment";
type Comparison = ReturnType<typeof compareRatings>;
type Dataset = Omit<ConsistencyDataset, "ratings"> & {
  comparison?: Comparison;
};
interface Stats {
  datasets: Dataset[];
  assessors: number;
  completed: number;
  scoreOverrides: number;
  aiAgreement: number | null;
  aiPairs: number;
  averages: { assessorId: string; count: number; average: number }[];
}
export function Quality() {
  const tr = useTranslate();
  const [stats, setStats] = useState<Stats | null>(null),
    [selected, setSelected] = useState<Dataset | null>(null),
    [demo, setDemo] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setError("");
    try {
      setStats((await api.get("/admin/quality")).data);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const comparison = demo
    ? compareRatings(syntheticRatings())
    : selected?.comparison;
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > 1024 * 1024) {
      setError("CSV must be smaller than 1 MB.");
      return;
    }
    setBusy(true);
    try {
      const data = (
        await api.post("/admin/quality/datasets", {
          title: file.name.slice(0, 100).padEnd(3, " "),
          csv: await file.text(),
        })
      ).data;
      setSelected(data);
      setDemo(false);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async (id: string) => {
    if (!id) {
      setSelected(null);
      setDemo(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setSelected((await api.get("/admin/quality/datasets/" + id)).data);
      setDemo(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const card = (title: string, metric: Agreement | null | undefined) => (
    <article className="panel quality-metric">
      <h3>{tr(title)}</h3>
      <strong className="quality-number">
        {metric?.kappa === null || metric?.kappa === undefined
          ? "—"
          : metric.kappa.toLocaleString(tr.locale, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
      </strong>
      <p>{tr("Chance-corrected agreement (Kappa)")}</p>
      <small>{metric ? tr(metric.metric) : tr("Not enough data yet")}</small>
      {metric && metric.kappa === null && (
        <p>{tr("Kappa is undefined when all ratings use one category.")}</p>
      )}
    </article>
  );
  return (
    <div className="container admin-portal">
      <PortalSidebar role="admin" />
      <main className="admin-content quality-page">
        <div className="section-label">{tr("ASSESSMENT QUALITY")}</div>
        <h1>{tr("Assessor Consistency")}</h1>
        <p>
          {tr(
            "Compare independent ratings of the same cases before and after rubric assistance.",
          )}
        </p>
        <Link to="/admin">{tr("Admin workspace")}</Link>
        <ErrorNotice message={tr(error)} />
        {!stats ? (
          error ? (
            <button className="button secondary" onClick={() => void load()}>
              {tr("Try again")}
            </button>
          ) : (
            <Loading />
          )
        ) : (
          <>
            <section className="panel quality-status">
              <span className="section-label">{tr("Status")}</span>
              <h2>
                {tr(
                  demo
                    ? "Demo Mode"
                    : comparison?.unassisted?.kappa !== null &&
                        comparison?.unassisted &&
                        comparison?.assisted?.kappa !== null &&
                        comparison?.assisted
                      ? "Paired ratings available"
                      : "Not enough data yet",
                )}
              </h2>
              {demo ? (
                <p className="notice warning" role="status">
                  {tr(
                    "Demonstration data only. Synthetic ratings, not collected from real assessors.",
                  )}
                </p>
              ) : (
                <p>
                  {tr(
                    "No improvement claim is made without paired assessor ratings.",
                  )}
                </p>
              )}
              <div className="quality-guide">
                <div>
                  <h3>{tr("To calculate consistency")}</h3>
                  <ul>
                    <li>
                      {tr("At least 2 assessors must score the same cases.")}
                    </li>
                    <li>{tr("3+ assessors recommended.")}</li>
                    <li>
                      {tr(
                        "Compare unassisted scoring with DakshSetu rubric-assisted scoring.",
                      )}
                    </li>
                  </ul>
                </div>
                <div>
                  <h3>{tr("Metric")}</h3>
                  <p>{tr("Cohen’s Kappa — 2 assessors")}</p>
                  <p>{tr("Fleiss’ Kappa — 3+ assessors")}</p>
                  <small>
                    {tr(
                      "Scores use the same 0–3 categories in both conditions.",
                    )}
                  </small>
                </div>
              </div>
              <div className="button-row">
                <label className="button">
                  <span>{tr(busy ? "Uploading…" : "Upload Ratings CSV")}</span>
                  <input
                    aria-label={tr("Upload Ratings CSV")}
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy}
                    onChange={upload}
                    className="sr-only"
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setDemo(true);
                    setError("");
                  }}
                >
                  {tr("Use Demo Dataset")}
                </button>
                {demo && (
                  <button
                    className="text-button"
                    onClick={() => setDemo(false)}
                  >
                    {tr("Return to actual data")}
                  </button>
                )}
              </div>
              <details>
                <summary>{tr("CSV format and matching rules")}</summary>
                <p>
                  {tr(
                    "Required headers: case_id,assessor_id,condition,score. Optional: criterion_id.",
                  )}
                </p>
                <pre>
                  {
                    "case_id,assessor_id,condition,score\ncase-1,assessor-1,unassisted,2"
                  }
                </pre>
                <p>
                  {tr(
                    "Conditions: unassisted or assisted. Integer scores: 0, 1, 2, 3. Maximum 5000 ratings / 1 MB. Duplicate cells are rejected.",
                  )}
                </p>
                <p>
                  {tr(
                    "Only complete cases and criteria rated by the same panel in both conditions are compared. At least 2 paired units are required. Imported assessor identities are not independently verified.",
                  )}
                </p>
              </details>
              {stats.datasets.length > 0 && (
                <label>
                  {tr("Imported dataset")}
                  <select
                    value={selected?.id ?? ""}
                    disabled={busy}
                    onChange={(e) => void choose(e.target.value)}
                  >
                    <option value="">{tr("Choose a dataset")}</option>
                    {stats.datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>
            <div className="quality-grid">
              {card("Unassisted scoring", comparison?.unassisted)}
              {card("DakshSetu-assisted scoring", comparison?.assisted)}
            </div>
            {comparison && (
              <section className="panel">
                <h3>{demo ? tr("Synthetic comparison") : selected?.title}</h3>
                <p>
                  {tr("Assessors")}: {comparison.assessors} ·{" "}
                  {tr("Paired cases / criteria")}: {comparison.pairedUnits} ·{" "}
                  {tr("Excluded cases / criteria")}: {comparison.excludedUnits}
                </p>
                <p>
                  {tr(
                    "Descriptive comparison only. A demo or an uncontrolled before/after comparison does not prove reduced assessor bias.",
                  )}
                </p>
              </section>
            )}
            <section className="panel">
              <h2>{tr("Actual platform activity")}</h2>
              <div className="stats-grid">
                <article>
                  <h3>{tr("Assessors")}</h3>
                  <strong>{stats.assessors}</strong>
                </article>
                <article>
                  <h3>{tr("Completed assessments")}</h3>
                  <strong>{stats.completed}</strong>
                </article>
                <article>
                  <h3>{tr("Practical score adjustments")}</h3>
                  <strong>{stats.scoreOverrides}</strong>
                </article>
                <article>
                  <h3>{tr("AI / human agreement within 20 points")}</h3>
                  <strong>
                    {stats.aiAgreement === null
                      ? "—"
                      : Math.round(stats.aiAgreement * 100) + "%"}
                  </strong>
                  <small>
                    {tr("Prototype tolerance; not an accuracy measure.")}
                  </small>
                </article>
              </div>
              <p>
                {tr(
                  "Different candidate groups make assessor averages unsuitable as evidence of bias.",
                )}
              </p>
              {stats.averages.length > 0 && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{tr("Assessor ID")}</th>
                        <th>{tr("Completed assessments")}</th>
                        <th>{tr("Average practical score")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.averages.map((a) => (
                        <tr key={a.assessorId}>
                          <td>{a.assessorId}</td>
                          <td>{a.count}</td>
                          <td>{a.average.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel">
              <h2>{tr("Assessor drift indicator")}</h2>
              <p>
                {tr(
                  "Mean deviation from the group on the same assisted cases. A 10-point difference prompts review; it does not prove bias or drift over time.",
                )}
              </p>
              {comparison?.drift.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{tr("Assessor ID")}</th>
                        <th>{tr("Average score")}</th>
                        <th>{tr("Group deviation")}</th>
                        <th>{tr("Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.drift.map((d) => (
                        <tr key={d.assessorId}>
                          <td>{d.assessorId}</td>
                          <td>{d.averageScore.toFixed(1)}%</td>
                          <td>
                            {d.groupDeviation > 0 ? "+" : ""}
                            {d.groupDeviation.toFixed(1)}
                          </td>
                          <td>
                            {tr(
                              d.reviewRecommended
                                ? "Review recommended"
                                : "Within prototype tolerance",
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>{tr("Not enough data yet")}</p>
              )}
            </section>
            <CalibrationCreator />
          </>
        )}
      </main>
    </div>
  );
}
export function CalibrationCreator() {
  const tr = useTranslate(),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [values, setValues] = useState<Record<string, number>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="panel">
      <summary>{tr("Create a calibration practice case")}</summary>
      <p>
        {tr(
          "An administrator supplies the scenario and reference ratings. This is a practice reference, not an official benchmark.",
        )}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await api.post("/admin/calibration/cases", {
              title,
              description,
              referenceScores: rubric.map((r) => ({
                criterionId: r.id,
                score: values[r.id],
              })),
            });
            setMessage("Practice case created.");
            setTitle("");
            setDescription("");
            setValues({});
          } catch (e) {
            setMessage(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {tr("Case title")}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={100}
          />
        </label>
        <label>
          {tr("Case scenario")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={30}
            maxLength={4000}
          />
        </label>
        {rubric.map((r) => (
          <label key={r.id}>
            {tr(r.criterion)}
            <select
              required
              value={values[r.id] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [r.id]: Number(e.target.value) })
              }
            >
              <option value="">{tr("Choose a score")}</option>
              {scoreLabels.map((s, i) => (
                <option key={i} value={i}>
                  {i} — {tr(s)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button className="button" disabled={busy}>
          {tr("Create practice case")}
        </button>
        <p role="status">{tr(message)}</p>
      </form>
    </details>
  );
}
export function Calibration() {
  const tr = useTranslate(),
    [cases, setCases] = useState<CalibrationCase[] | null>(null),
    [key, setKey] = useState(""),
    [values, setValues] = useState<Record<string, number>>({}),
    [result, setResult] = useState<{
      score: number;
      reference: number;
      deviation: number;
      criteria: { criterionId: string; reference: number; score: number }[];
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get("/calibration/cases")
      .then((r) => setCases(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const sample = cases?.find((c) => c.id === key);
  return (
    <div className="container workspace">
      <PortalSidebar role="assessor" />
      <main className="workspace-main calibration-page">
        <h1>{tr("Calibration practice")}</h1>
        <p>
          {tr(
            "Score independently before viewing the administrator’s reference. Practice scores do not affect worker credentials or the consistency experiment.",
          )}
        </p>
        <ErrorNotice message={tr(error)} />
        {!cases ? (
          error ? (
            <button
              className="button secondary"
              onClick={() => {
                setError("");
                api
                  .get("/calibration/cases")
                  .then((r) => setCases(r.data))
                  .catch((e) => setError(errorMessage(e)));
              }}
            >
              {tr("Try again")}
            </button>
          ) : (
            <Loading />
          )
        ) : cases.length === 0 ? (
          <section className="panel">
            <h2>{tr("No practice cases yet")}</h2>
            <p>
              {tr(
                "Ask an administrator to add a scenario and reference rubric.",
              )}
            </p>
          </section>
        ) : (
          <>
            <label>
              {tr("Choose a case")}
              <select
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setValues({});
                  setResult(null);
                  setError("");
                }}
              >
                <option value="">{tr("Choose a case")}</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            {sample && (
              <section className="panel">
                <h2>{sample.title}</h2>
                <p className="preserve-lines">{sample.description}</p>
                {result ? (
                  <>
                    <h3>{tr("Practice comparison")}</h3>
                    <p>
                      {tr("Your score")}: {result.score}% ·{" "}
                      {tr("Reference score")}: {result.reference}% ·{" "}
                      {tr("Deviation")}: {result.deviation > 0 ? "+" : ""}
                      {result.deviation}
                    </p>
                    <p>
                      {tr(
                        "Administrator-entered reference. Differences are prompts for discussion, not proof of bias.",
                      )}
                    </p>
                    <ul>
                      {result.criteria.map((r) => (
                        <li key={r.criterionId}>
                          {tr(
                            rubric.find((c) => c.id === r.criterionId)!
                              .criterion,
                          )}
                          : {r.score} / {r.reference}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      try {
                        setResult(
                          (
                            await api.post(
                              "/calibration/cases/" + key + "/score",
                              {
                                scores: rubric.map((r) => ({
                                  criterionId: r.id,
                                  score: values[r.id],
                                })),
                              },
                            )
                          ).data,
                        );
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {rubric.map((r) => (
                      <label key={r.id}>
                        {tr(r.criterion)}
                        <select
                          required
                          value={values[r.id] ?? ""}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [r.id]: Number(e.target.value),
                            })
                          }
                        >
                          <option value="">{tr("Choose a score")}</option>
                          {scoreLabels.map((s, i) => (
                            <option key={i} value={i}>
                              {i} — {tr(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <button className="button" disabled={busy}>
                      {tr("Submit practice ratings")}
                    </button>
                  </form>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
