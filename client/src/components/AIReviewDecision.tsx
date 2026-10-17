import { useState } from "react";
import { api, errorMessage } from "../services/api";
import { useTranslate } from "../localization";
import { ErrorNotice } from "./common";
import type { Assessment } from "../../../shared/types";
export function AIReviewDecision({
  assessment: a,
  canEdit,
  onSaved,
}: {
  assessment: Assessment;
  canEdit: boolean;
  onSaved: (a: Assessment) => void;
}) {
  const currentReview =
    a.aiReview?.analysisCreatedAt === a.aiObservation?.createdAt
      ? a.aiReview
      : undefined;
  const tr = useTranslate(),
    [decision, setDecision] = useState(currentReview?.decision ?? "accepted"),
    [note, setNote] = useState(currentReview?.note ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!a.aiObservation) return null;
  return (
    <section className="workspace-panel">
      <h3>{tr("Human review of AI observation")}</h3>
      <p>
        {tr(
          "Keep the original AI record. Record your acceptance, correction or rejection separately.",
        )}
      </p>
      {a.aiReview && (
        <p>
          {!currentReview && (
            <strong>
              {tr("This review refers to an earlier AI observation.")}{" "}
            </strong>
          )}
          {tr(a.aiReview.decision)} · {a.aiReview.note} ·{" "}
          {new Date(a.aiReview.at).toLocaleString(tr.locale)}
        </p>
      )}
      {canEdit && (
        <>
          <label className="field">
            {tr("Review decision")}
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as typeof decision)}
            >
              <option value="accepted">{tr("Accept observation")}</option>
              <option value="edited">{tr("Correct observation")}</option>
              <option value="rejected">{tr("Reject observation")}</option>
            </select>
          </label>
          <label className="field">
            {tr("Review notes")}
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1500}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || note.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                onSaved(
                  (
                    await api.post("/assessments/" + a.id + "/ai-review", {
                      baseVersion: a.version,
                      decision,
                      note,
                    })
                  ).data,
                );
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr("Save AI review")}
          </button>
          <ErrorNotice message={error} />
        </>
      )}
    </section>
  );
}
