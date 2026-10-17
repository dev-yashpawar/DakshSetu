import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, ShieldX } from "lucide-react";
import type { VerificationView } from "../../../shared/advanced";
import { api, errorMessage } from "../services/api";
import { useTranslate } from "../localization";
import { useConnectivity } from "../components/OfflineStatus";
import { ErrorNotice, Loading } from "../components/common";
export function Verify() {
  const tr = useTranslate(),
    { credentialId } = useParams(),
    online = useConnectivity();
  const [record, setRecord] = useState<VerificationView | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setRecord(null);
    setError("");
    if (!online) {
      setLoading(false);
      return;
    }
    void api
      .get<VerificationView>("/credentials/" + credentialId + "/verify")
      .then(({ data }) => {
        if (active) setRecord(data);
      })
      .catch((e) => {
        if (active) {
          if (e.response?.status === 404) setRecord({ status: "NOT_FOUND" });
          else setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [credentialId, online, revision]);
  return (
    <main className="container verification-page">
      <div className="section-label">{tr("PUBLIC VERIFICATION")}</div>
      <h1>{tr("DakshSetu Skill Passport Verification")}</h1>
      <p>{tr("Prototype competency record. Not a government certificate.")}</p>
      <ErrorNotice message={tr(error)} />
      {!online ? (
        <p className="notice">
          {tr("Reconnect to check the current credential status.")}
        </p>
      ) : loading ? (
        <Loading />
      ) : (
        record && (
          <section
            className={
              "workspace-panel verify-record " +
              (record.status === "VALID" ? "valid" : "invalid")
            }
          >
            {record.status === "VALID" ? (
              <ShieldCheck size={38} />
            ) : (
              <ShieldX size={38} />
            )}
            <h2>
              {tr(record.status === "NOT_FOUND" ? "NOT FOUND" : record.status)}
            </h2>
            {record.status === "NOT_FOUND" ? (
              <p>{tr("No valid credential was found for this link.")}</p>
            ) : (
              <>
                <p className="passport-id">{record.credentialId}</p>
                <h3>{record.workerName}</h3>
                <p>
                  {tr(record.trade ?? "")} ·{" "}
                  {new Date(record.assessmentDate!).toLocaleDateString(
                    tr.locale,
                  )}
                </p>
                <p>
                  {tr("Revision")} {record.revision}
                </p>
                {record.status === "REVOKED" ? (
                  <p>
                    {tr(
                      "This credential has been revoked. It must not be used as a valid competency record.",
                    )}
                  </p>
                ) : (
                  <>
                    <p>{tr("Assessor verified")}</p>
                    <h3>
                      {tr("Overall competency score")}: {record.overallScore}%
                    </h3>
                    <h3>{tr("Verified competencies")}</h3>
                    <ul>
                      {record.verifiedCompetencies?.map((c) => (
                        <li key={c.name + c.source}>
                          {tr(c.name)} · {c.score}% ·{" "}
                          {tr(
                            c.source === "self-assessment"
                              ? "Self-assessment"
                              : c.source === "reassessment"
                                ? "Reassessment"
                                : "Practical assessment",
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        )
      )}
      {record?.status === "VALID" && (record.revision ?? 1) > 1 && (
        <p className="notice">
          {tr(
            "Reassessment supplements the original outcome. Its score and recommendation are preserved.",
          )}
        </p>
      )}
      <button
        className="button outline"
        disabled={!online || loading}
        onClick={() => setRevision((r) => r + 1)}
      >
        {tr("Check again")}
      </button>
    </main>
  );
}
