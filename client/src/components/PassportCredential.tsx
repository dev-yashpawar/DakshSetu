import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import type { SkillPassport } from "../../../shared/types";
import type { CredentialView } from "../../../shared/advanced";
import { api, errorMessage } from "../services/api";
import { useTranslate } from "../localization";
import { useSession } from "../store/session";
import { useConnectivity } from "./OfflineStatus";
import { ErrorNotice, Loading } from "./common";
import { ReassessmentPanel } from "./ReassessmentPanel";
export function PassportCredential({ passport }: { passport: SkillPassport }) {
  const tr = useTranslate(),
    { user } = useSession(),
    online = useConnectivity(),
    linkRef = useRef<HTMLInputElement>(null);
  const [credential, setCredential] = useState<CredentialView | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setCredential(
        (
          await api.get<CredentialView>(
            "/credentials/assessment/" + passport.assessmentId,
          )
        ).data,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const changed = () => void load();
    window.addEventListener("dakshsetu:credential-updated", changed);
    return () =>
      window.removeEventListener("dakshsetu:credential-updated", changed);
  }, [passport.assessmentId]);
  const url =
    credential?.verificationUrl ??
    (credential ? window.location.origin + credential.verificationPath : "");
  const pdf = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get(
          "/passports/" + passport.assessmentId + "/pdf",
          { responseType: "blob" },
        ),
        href = URL.createObjectURL(data),
        a = document.createElement("a");
      a.href = href;
      a.download = `${credential?.credentialId ?? "dakshsetu-passport"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setError("PDF generation is unavailable. Use Print / Save PDF instead.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error();
      await navigator.clipboard.writeText(url);
      setNotice("Verification link copied.");
    } catch {
      linkRef.current?.select();
      setNotice("Copy the displayed verification link.");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "DakshSetu Skill Passport",
          text: passport.workerName,
          url,
        });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    await copy();
  };
  const revoke = async () => {
    if (!credential) return;
    setBusy(true);
    setError("");
    try {
      await api.post(
        "/admin/credentials/" + credential.credentialId + "/revoke",
        { revision: credential.revision, reason },
      );
      setReason("");
      await load();
      setNotice("Credential revoked. The original assessment is preserved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={"credential-panel " + (credential ? "credential-ready" : "")}
    >
      <h2>{tr("QR-verifiable Skill Passport")}</h2>
      <ErrorNotice message={tr(error)} />
      {notice && (
        <p role="status" className="notice">
          {tr(notice)}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : credential ? (
        <>
          <div className="credential-summary">
            <QRCodeSVG
              value={url}
              size={150}
              marginSize={2}
              level="M"
              aria-label={tr("Credential QR code")}
            />
            <div>
              <strong>{credential.credentialId}</strong>
              <p>
                {tr("Credential status")}:{" "}
                <strong>
                  {tr(
                    credential.status === "REVOKED"
                      ? "REVOKED"
                      : credential.status === "UPDATED"
                        ? "UPDATED"
                        : "VALID",
                  )}
                </strong>{" "}
                · {tr("Revision")} {credential.revision}
              </p>
              <p>
                {tr(
                  "Public verification shows only the name, trade, verified competencies, assessment date and credential status.",
                )}
              </p>
              <Link className="text-button" to={credential.verificationPath}>
                {tr("Open verification page")}
              </Link>
            </div>
          </div>
          {!online && (
            <p className="notice">
              {tr(
                "Saved credential status may have changed. Reconnect to verify the current status.",
              )}
            </p>
          )}
          <label className="verification-link">
            {tr("Verification link")}
            <input
              ref={linkRef}
              value={url}
              readOnly
              aria-label={tr("Verification link")}
            />
          </label>
          <div className="passport-actions">
            <button
              className="button"
              disabled={!online || busy}
              onClick={() => void pdf()}
            >
              {tr("Download PDF")}
            </button>
            <button className="button outline" onClick={() => void share()}>
              {tr("Share")}
            </button>
            <button className="text-button" onClick={() => void copy()}>
              {tr("Copy verification link")}
            </button>
          </div>
          {user?.role === "admin" && credential.status !== "REVOKED" && (
            <div className="credential-revocation">
              <label>
                {tr("Reason for revocation")}
                <textarea
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <p>
                {tr(
                  "Revocation is permanent. The signed-off assessment will remain unchanged.",
                )}
              </p>
              <button
                className="button outline"
                disabled={!online || busy || reason.trim().length < 10}
                onClick={() => void revoke()}
              >
                {tr("Revoke credential")}
              </button>
            </div>
          )}
          {!!credential.history.length && (
            <>
              <h3>{tr("Reassessment history")}</h3>
              <div className="table-scroll">
                <table className="candidate-table">
                  <thead>
                    <tr>
                      <th>{tr("Competency")}</th>
                      <th>{tr("Before")}</th>
                      <th>{tr("After")}</th>
                      <th>{tr("Assessment date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credential.history.map((h) => (
                      <tr key={h.id}>
                        <td>{tr(h.competency)}</td>
                        <td>{h.previousScore}%</td>
                        <td>{h.newScore}%</td>
                        <td>
                          {new Date(h.completedAt!).toLocaleDateString(
                            tr.locale,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                {tr(
                  "Reassessment supplements the original outcome. Its score and recommendation are preserved.",
                )}
              </p>
            </>
          )}
        </>
      ) : (
        <button className="text-button" onClick={() => void load()}>
          {tr("Try again")}
        </button>
      )}
      {credential && <ReassessmentPanel assessmentId={passport.assessmentId} />}
    </section>
  );
}
