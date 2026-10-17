import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShieldCheck, Printer, Download, ArrowLeft } from "lucide-react";
import { api, errorMessage } from "../services/api";
import { useSession } from "../store/session";
import { useTranslate } from "../localization";
import { ErrorNotice, Loading } from "../components/common";
import type { SkillPassport } from "../../../shared/types";
import { PassportCredential } from "../components/PassportCredential";
export function Passport() {
  const tr = useTranslate(),
    { assessmentId } = useParams(),
    { user } = useSession();
  const [passport, setPassport] = useState<SkillPassport | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setPassport(
        (await api.get<SkillPassport>("/passports/" + assessmentId)).data,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [assessmentId]);
  const download = () => {
    if (!passport) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(passport, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `dakshsetu-passport-${passport.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main className="container passport-page">
      <div className="passport-actions">
        <Link
          className="text-button"
          to={
            user?.role === "worker"
              ? "/worker/result"
              : user?.role === "admin"
                ? "/admin/assessments"
                : "/assessor"
          }
        >
          <ArrowLeft size={17} />
          {tr("Back to assessment")}
        </Link>
        <div>
          <button
            className="button outline"
            disabled={!passport}
            onClick={() => window.print()}
          >
            <Printer size={18} />
            {tr("Print / Save PDF")}
          </button>
          <button className="button" disabled={!passport} onClick={download}>
            <Download size={18} />
            {tr("Download passport data")}
          </button>
        </div>
      </div>
      <ErrorNotice message={error}>
        <button className="text-button" onClick={() => void load()}>
          {tr("Try again")}
        </button>
      </ErrorNotice>
      {loading ? (
        <Loading />
      ) : (
        passport && (
          <article className="skill-passport">
            <header className="passport-heading">
              <img src="/dakshsetu-logo.png" alt="DakshSetu" />
              <div>
                <div className="section-label">{tr("SKILL PASSPORT")}</div>
                <h1>{passport.workerName}</h1>
                <p>{tr(passport.trade)}</p>
              </div>
              <span className="status-pill">
                <ShieldCheck size={18} />
                {tr("Assessor verified")}
              </span>
            </header>
            <p className="passport-disclaimer">
              {tr("Prototype skill record · Not a government certificate")}
            </p>
            <PassportCredential passport={passport} />
            <dl className="passport-facts">
              <div>
                <dt>{tr("Qualification")}</dt>
                <dd>{tr(passport.qualificationTitle)}</dd>
              </div>
              <div>
                <dt>{tr("Qualification code")}</dt>
                <dd>{passport.qualificationCode}</dd>
              </div>
              <div>
                <dt>{tr("NSQF level (demo)")}</dt>
                <dd>{passport.nsqfLevel}</dd>
              </div>
              <div>
                <dt>{tr("Assessment date")}</dt>
                <dd>
                  {new Date(passport.signedOffAt).toLocaleString(tr.locale, {
                    timeZone: "Asia/Kolkata",
                  })}
                </dd>
              </div>
              <div>
                <dt>{tr("Assessor")}</dt>
                <dd>{passport.assessorName}</dd>
              </div>
              <div>
                <dt>{tr("Passport ID")}</dt>
                <dd className="passport-id">{passport.id}</dd>
              </div>
            </dl>
            <section className="passport-score">
              <div>
                <span>{tr("Overall competency score")}</span>
                <strong>{passport.overallScore}%</strong>
              </div>
              <div>
                <h2>{tr(passport.recommendation)}</h2>
                <p>
                  {tr(
                    "Score calculated using the rules saved when this assessment began.",
                  )}
                </p>
                <p>
                  {tr("Self-assessment")}: {passport.selfAssessmentScore}% ·{" "}
                  {tr("Approved practical score")}: {passport.practicalScore}%
                </p>
              </div>
            </section>
            <section>
              <h2>{tr("Competency breakdown")}</h2>
              <p>
                {tr(
                  "These scores come from the saved self-assessment questions.",
                )}
              </p>
              <div className="passport-competencies">
                {passport.competencyScores.map((c) => (
                  <div key={c.name}>
                    <span>{tr(c.name)}</span>
                    <strong>{c.score}%</strong>
                    <progress
                      max={100}
                      value={c.score}
                      aria-label={tr(c.name)}
                    />
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h2>{tr("Practical criterion scores")}</h2>
              <p>
                {tr(
                  "Saved rubric scores are shown separately from the assessor’s approved overall practical score.",
                )}
              </p>
              <div className="table-scroll">
                <table className="candidate-table">
                  <thead>
                    <tr>
                      <th>{tr("Criterion")}</th>
                      <th>{tr("Section")}</th>
                      <th>{tr("Score")}</th>
                      <th>{tr("Weight")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passport.practicalCriteria.map((c) => (
                      <tr key={c.criterion}>
                        <td>{tr(c.criterion)}</td>
                        <td>{tr(c.section)}</td>
                        <td>
                          {c.score} / {c.maxScore}
                        </td>
                        <td>{c.weight}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="passport-insights">
              <section>
                <h2>{tr("Strengths")}</h2>
                {passport.strengths.length ? (
                  <ul>
                    {passport.strengths.map((s) => (
                      <li key={s}>{tr(s)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {tr("No independently demonstrated criteria recorded.")}
                  </p>
                )}
              </section>
              <section>
                <h2>{tr("Areas to improve")}</h2>
                {passport.gaps.length ? (
                  <ul>
                    {passport.gaps.map((s) => (
                      <li key={s}>{tr(s)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{tr("No gaps identified by these prototype rules.")}</p>
                )}
              </section>
            </div>
            <section>
              <h2>{tr("Declared skills")}</h2>
              <p>
                {tr(
                  "Worker-confirmed skills; these are not separate certifications.",
                )}
              </p>
              <div className="skill-tags">
                {passport.declaredSkills.map((s) => (
                  <span key={s}>{tr(s)}</span>
                ))}
              </div>
            </section>
            <footer className="passport-footer">
              <ShieldCheck size={20} />
              <span>
                {tr("AI assists. The assessor decides.")}
                <br />
                {tr("Generated from the locked assessment record.")}{" "}
                {new Date(passport.generatedAt).toLocaleDateString(tr.locale)}
              </span>
            </footer>
          </article>
        )
      )}
    </main>
  );
}
