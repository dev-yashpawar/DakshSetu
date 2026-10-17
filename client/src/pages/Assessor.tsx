import { PortalSidebar } from "../components/PortalSidebar";
import { AIReviewDecision } from "../components/AIReviewDecision";
import { VoiceNote } from "../components/VoiceNote";
import { useTranslate } from "../localization";
import {
  getDraft,
  saveDraft,
  savePractical,
  queueMedia,
  discardResource,
  pendingItems,
  storeResponse,
  type DeviceDraft,
} from "../services/offline";
import { useConnectivity } from "../components/OfflineStatus";
import { VideoReview } from "../components/VideoReview";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  LayoutDashboard,
  ClipboardCheck,
  FileBarChart2,
  Search,
  Zap,
  ShieldCheck,
  Upload,
  ImagePlus,
  Eye,
  Sparkles,
  LockKeyhole,
  Save,
  LoaderCircle,
  Check,
  MinusCircle,
} from "lucide-react";
import { api, errorMessage } from "../services/api";
import { useSession } from "../store/session";
import { ErrorNotice, Loading } from "../components/common";
import {
  getRubric,
  safetyWarnings,
  scoreLabels,
  calculatePractical,
  calculateFinal,
  suggestedRecommendation,
  recommendations,
  prototypeScoring,
  practicalTask,
} from "../../../shared/assessment";
import type {
  Assessment,
  Candidate,
  CandidateSummary,
  Evidence,
  RubricScore,
} from "../../../shared/types";

const serializeRows = (rows: RubricScore[]) =>
  JSON.stringify(
    rows.map((r) => ({
      criterionId: r.criterionId,
      score: r.score,
      remark: r.remark,
      evidenceIds: r.evidenceIds ?? [],
    })),
  );
export function StatusPill({ status }: { status: Assessment["status"] }) {
  const tr = useTranslate();

  return (
    <span className={`assessment-status ${status.toLowerCase()}`}>
      {tr(
        status === "SIGNED_OFF" ? (
          <CheckCircle2 size={14} />
        ) : status === "IN_ASSESSMENT" ? (
          <ClipboardCheck size={14} />
        ) : (
          <Clock size={14} />
        ),
      )}
      {tr(
        {
          SELF_ASSESSED: "Awaiting practical",
          IN_ASSESSMENT: "In assessment",
          SIGNED_OFF: "Assessor verified",
        }[status],
      )}
    </span>
  );
}
function Workspace({
  children,
  title,
  description,
  eyebrow = "ASSESSOR WORKSPACE",
}: {
  children: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
}) {
  const tr = useTranslate();

  const { user } = useSession();
  return (
    <>
      <div className="container workspace">
        <PortalSidebar role="assessor" />
        <main className="workspace-main">
          <header className="workspace-heading">
            <h1>{title}</h1>
            <details className="help-disclosure">
              <summary>{tr("Assessment guidance")}</summary>
              <p>{tr(description)}</p>
            </details>
          </header>
          {tr(children)}
        </main>
      </div>
    </>
  );
}
function CandidateTable({
  items,
  reports = false,
}: {
  items: CandidateSummary[];
  reports?: boolean;
}) {
  const tr = useTranslate();

  if (!items.length)
    return (
      <div className="empty-state">
        <Users size={33} />
        <h3>
          {tr(
            reports
              ? "No signed-off assessments yet"
              : "No candidates here yet",
          )}
        </h3>
        <p>
          {tr(
            reports
              ? "Completed assessments will appear here after your sign-off."
              : "Workers appear here after completing their self-assessment.",
          )}
        </p>
      </div>
    );
  return (
    <div className="table-scroll">
      <table className="candidate-table">
        <thead>
          <tr>
            <th>{tr("Candidate")}</th>
            <th>{tr("Experience")}</th>
            <th>{tr("Profile match")}</th>
            <th>{tr(reports ? "Overall score" : "Self-assessment")}</th>
            <th>{tr("Status")}</th>
            <th>
              <span className="sr-only">{tr("Action")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.user.id}>
              <td>
                <Link
                  className="candidate-name"
                  to={`/assessor/candidates/${c.user.id}`}
                >
                  <span>
                    {c.user.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <strong>{c.user.name}</strong>
                    <small>{tr(c.profile.trade)}</small>
                  </div>
                </Link>
              </td>
              <td>
                {tr(c.profile.yearsExperience)}
                {tr(" years")}
              </td>
              <td>
                <strong>{tr(c.profile.matchScore ?? 0)}%</strong>
              </td>
              <td>
                <strong>
                  {tr(
                    reports
                      ? c.assessment.finalScore
                      : c.assessment.selfAssessmentScore,
                  )}
                  %
                </strong>
              </td>
              <td>
                <StatusPill status={c.assessment.status} />
              </td>
              <td>
                <Link
                  className="table-action"
                  to={`/assessor/candidates/${c.user.id}${reports ? "?tab=recommendation" : ""}`}
                >
                  {tr("View")}
                  <ArrowRight size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function AssessorDashboard() {
  const tr = useTranslate();

  const [items, setItems] = useState<CandidateSummary[]>([]),
    [stats, setStats] = useState<{
      assigned: number;
      available: number;
      pending: number;
      inProgress?: number;
      completed: number;
      requiresReview: number;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get("/assessor/dashboard"),
        api.get<CandidateSummary[]>("/assessor/candidates"),
      ]);
      setStats(a.data);
      setItems(b.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <Workspace
      title={tr("Dashboard")}
      description={tr(
        "Review experience. Observe the practical. Make an informed decision.",
      )}
    >
      <ErrorNotice message={tr(error)}>
        {error && (
          <button className="text-button" onClick={() => void load()}>
            {tr("Try again")}
          </button>
        )}
      </ErrorNotice>
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="workspace-section-heading">
            <div className="section-label">{tr("01 · YOUR OVERVIEW")}</div>
            <span className="neutral-pill">{tr("Electrician pilot")}</span>
          </div>
          <div className="stats-grid">
            {[
              {
                label: "Assigned candidates",
                value: stats?.assigned ?? 0,
                icon: Users,
                color: "navy",
              },
              {
                label: "Pending assessment",
                value: stats?.pending ?? 0,
                icon: Clock,
                color: "orange",
              },
              {
                label: "In progress",
                value: stats?.inProgress ?? 0,
                icon: ClipboardCheck,
                color: "plain",
              },
              {
                label: "Completed",
                value: stats?.completed ?? 0,
                icon: CheckCircle2,
                color: "green",
              },
              {
                label: "Requires review",
                value: stats?.requiresReview ?? 0,
                icon: AlertTriangle,
                color: "plain",
              },
            ].map((s) => (
              <article className={`stat-card ${s.color}`} key={s.label}>
                <s.icon size={22} />
                <strong>{tr(s.value)}</strong>
                <h3>{tr(s.label)}</h3>
              </article>
            ))}
          </div>
          <div className="workspace-panel">
            <div className="panel-heading">
              <div>
                <div className="section-label">{tr("02 · CANDIDATES")}</div>
                <h2>{tr("Ready for the next step")}</h2>
                <p>
                  {stats?.available ?? 0}{" "}
                  {tr(
                    stats?.available === 1
                      ? "candidate available to start."
                      : "candidates available to start.",
                  )}
                </p>
              </div>
              <Link className="text-button" to="/assessor/candidates">
                {tr("View all")}
                <ArrowRight size={17} />
              </Link>
            </div>
            <CandidateTable
              items={items
                .filter((c) => c.assessment.status !== "SIGNED_OFF")
                .slice(0, 5)}
            />
          </div>
          <div className="prototype-rule">
            <ShieldCheck size={23} />
            <div>
              <strong>{tr("A consistent rubric. A human decision.")}</strong>
              <p>
                {tr(
                  "AI observations support your review. They never finalise an assessment or issue a certificate.",
                )}
              </p>
            </div>
          </div>
        </>
      )}
    </Workspace>
  );
}
export function AssessorList({
  mode,
}: {
  mode: "candidates" | "assessments" | "reports";
}) {
  const tr = useTranslate();

  const { user } = useSession(),
    [items, setItems] = useState<CandidateSummary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await api.get("/assessor/candidates")).data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [mode]);
  const filtered = items.filter(
    (c) =>
      (mode === "candidates" || c.assessment.assessorId === user?.id) &&
      (mode !== "reports" || c.assessment.status === "SIGNED_OFF") &&
      (status === "all" || c.assessment.status === status) &&
      c.user.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Workspace
      title={tr(
        mode === "reports"
          ? "Assessment reports"
          : mode === "assessments"
            ? "Your assessments"
            : "Candidate directory",
      )}
      description={tr(
        mode === "reports"
          ? "Signed-off results, grounded in your saved assessment records."
          : mode === "assessments"
            ? "Continue practical assessments and review completed work."
            : "Meet the workers bringing years of experience to the assessment.",
      )}
    >
      <div className="workspace-panel">
        <div className="panel-heading">
          <div>
            <div className="section-label">
              {tr("ELECTRICIAN · DOMESTIC SOLUTIONS")}
            </div>
            <h2>
              {tr(
                mode === "reports"
                  ? "Verified assessment records"
                  : "A clear view of every candidate",
              )}
            </h2>
          </div>
          <span className="neutral-pill">
            {tr(filtered.length)}
            {tr(" records")}
          </span>
        </div>
        <div className="table-filters">
          <label className="search-field">
            <Search size={19} />
            <span className="sr-only">{tr("Search candidates")}</span>
            <input
              aria-label={tr("Search candidates")}
              placeholder={tr("Search by candidate name")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {mode !== "reports" && (
            <label className="filter-field">
              <span className="sr-only">{tr("Filter by status")}</span>
              <select
                aria-label={tr("Filter by status")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{tr("All statuses")}</option>
                <option value="SELF_ASSESSED">
                  {tr("Awaiting practical")}
                </option>
                <option value="IN_ASSESSMENT">{tr("In assessment")}</option>
                <option value="SIGNED_OFF">{tr("Assessor verified")}</option>
              </select>
            </label>
          )}
        </div>
        <ErrorNotice message={tr(error)}>
          <button className="text-button" onClick={() => void load()}>
            {tr("Try again")}
          </button>
        </ErrorNotice>
        {tr(
          loading ? (
            <Loading />
          ) : (
            <CandidateTable items={filtered} reports={mode === "reports"} />
          ),
        )}
      </div>
    </Workspace>
  );
}

function EvidenceImage({
  evidence,
  assessmentId,
}: {
  evidence: Evidence;
  assessmentId: string;
}) {
  const tr = useTranslate();

  const [url, setUrl] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    const controller = new AbortController();
    setError(false);
    api
      .get(`/assessments/${assessmentId}/evidence/${evidence.id}/content`, {
        responseType: "blob",
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (active) {
          objectUrl = URL.createObjectURL(data);
          setUrl(objectUrl);
        }
      })
      .catch((e) => {
        if (active && e.code !== "ERR_CANCELED") setError(true);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidence.id, assessmentId]);
  return (
    <div className="evidence-image">
      {url ? (
        <img
          src={url}
          alt={tr("Practical evidence: {filename}", {
            filename: evidence.filename,
          })}
        />
      ) : error ? (
        <span>
          {tr("Preview unavailable. Reload the assessment to retry.")}
        </span>
      ) : (
        <LoaderCircle className="spin" size={24} />
      )}
    </div>
  );
}

export function CandidateDetail() {
  const tr = useTranslate();
  const online = useConnectivity();
  const [deviceDraft, setDeviceDraft] = useState<DeviceDraft | undefined>(),
    [pendingSync, setPendingSync] = useState(false);

  const { id } = useParams(),
    { user } = useSession(),
    [search, setSearch] = useSearchParams();
  const tab = search.get("tab") ?? "overview",
    setTab = (value: string) => setSearch({ tab: value });
  const [candidate, setCandidate] = useState<Candidate | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false);
  const [scores, setScores] = useState<
      Record<string, { score: number; remark: string; evidenceIds?: string[] }>
    >({}),
    [savedScores, setSavedScores] = useState("[]"),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [selectedEvidence, setSelectedEvidence] = useState(""),
    [aiError, setAIError] = useState(""),
    [finalPractical, setFinalPractical] = useState(""),
    [recommendation, setRecommendation] = useState<string>(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState("");
  const uploadId = useRef(crypto.randomUUID()),
    fileRef = useRef<HTMLInputElement>(null);
  const toScores = (rows: RubricScore[]) =>
    Object.fromEntries(
      rows.map((r) => [
        r.criterionId,
        { score: r.score, remark: r.remark, evidenceIds: r.evidenceIds ?? [] },
      ]),
    );
  const load = async () => {
    setLoading(true);
    setError("");
    setConflict(false);
    try {
      const { data: c } = await api.get<Candidate>(
        "/assessor/candidates/" + id,
      );
      setCandidate(c);
      const rows = c.assessment.practical?.rubricScores ?? [];
      const draft = user
        ? await getDraft(user.id, "practical", c.assessment.id)
        : undefined;
      setDeviceDraft(draft);
      const restored =
        draft &&
        draft.baseVersion === c.assessment.version &&
        c.assessment.status !== "SIGNED_OFF"
          ? (draft.payload as { rubricScores: RubricScore[] }).rubricScores
          : undefined;
      setScores(toScores(restored ?? rows));
      setSavedScores(serializeRows(rows));
      setSelectedEvidence(
        c.assessment.aiObservation?.evidenceId ?? c.evidence[0]?.id ?? "",
      );
      setFinalPractical(
        c.assessment.assessorScore?.toString() ??
          c.assessment.practical?.rubricScore.toString() ??
          "",
      );
      setRecommendation(c.assessment.recommendation ?? "");
      setReason(c.assessment.overrideReason ?? "");
      setConfirmed(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    if (candidate && user)
      void storeResponse(user.id, "/assessor/candidates/" + id, candidate);
  }, [candidate, user?.id, id]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const rubric = getRubric(
    candidate?.assessment.rubricVersion,
    candidate?.assessment.rubricSnapshot,
  );
  const rows = rubric
    .filter((r) => scores[r.id] !== undefined)
    .map((r) => ({ criterionId: r.id, ...scores[r.id] }));
  const dirty = serializeRows(rows) !== savedScores;
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setConflict(false);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
      setConflict(
        (e as { response?: { status: number } }).response?.status === 409,
      );
    } finally {
      setBusy(false);
    }
  };
  const apply = (assessment: Assessment) =>
    setCandidate((c) =>
      c
        ? {
            ...c,
            assessment,
            profile: { ...c.profile, status: assessment.status },
          }
        : c,
    );
  const a = candidate?.assessment,
    locked = a?.status === "SIGNED_OFF",
    canEdit = !!a && a.assessorId === user?.id && !locked;
  const practicalScore = calculatePractical(
      rows,
      a?.rubricVersion ?? 1,
      a?.rubricSnapshot,
    ),
    complete = rows.length === rubric.length;
  const finalValue = finalPractical === "" ? NaN : Number(finalPractical),
    validScore =
      Number.isInteger(finalValue) && finalValue >= 0 && finalValue <= 100;
  const overall =
    a && validScore
      ? calculateFinal(a.selfAssessmentScore, finalValue, a.scoringPolicy)
      : 0;
  const suggested = suggestedRecommendation(overall, a?.scoringPolicy),
    chosenRecommendation = recommendation || suggested;
  const adjustment =
    !!a &&
    validScore &&
    (finalValue !== (a.practical?.rubricScore ?? 0) ||
      (a.aiSuggestedScore !== undefined && finalValue !== a.aiSuggestedScore) ||
      chosenRecommendation !== suggested);
  useEffect(() => {
    if (
      canEdit &&
      dirty &&
      !loading &&
      user &&
      a &&
      !(deviceDraft && deviceDraft.baseVersion !== a.version)
    )
      void saveDraft(
        user.id,
        "practical",
        a.id,
        { rubricScores: rows },
        a.version,
      ).catch((e) => setError(e.message));
  }, [
    canEdit,
    dirty,
    loading,
    user?.id,
    a?.id,
    a?.version,
    JSON.stringify(rows),
  ]);
  useEffect(() => {
    const changed = () => {
      if (user && a)
        void pendingItems(user.id).then((items) =>
          setPendingSync(
            items.some(
              (i) =>
                (i.type === "practical" && i.resourceId === a.id) ||
                (i.type === "media" && i.payload.assessmentId === a.id),
            ),
          ),
        );
    };
    const synced = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        detail?.type === "media" &&
        detail.payload?.assessmentId === a?.id &&
        user
      ) {
        void api
          .get<Candidate>("/assessor/candidates/" + id)
          .then(async ({ data: c }) => {
            if (
              serializeRows(c.assessment.practical?.rubricScores ?? []) !==
              savedScores
            ) {
              const draft = await getDraft(
                user.id,
                "practical",
                c.assessment.id,
              );
              if (draft) setDeviceDraft(draft);
            }
            setCandidate(c);
            if (detail.payload.kind === "image")
              setSelectedEvidence(
                detail.evidence?.id ?? c.evidence.at(-1)?.id ?? "",
              );
            setNotice(
              detail.payload.kind === "image"
                ? "Evidence uploaded and saved."
                : "Video uploaded and saved.",
            );
          })
          .catch((e) => setError(errorMessage(e)));
      }
      if (
        detail?.resourceId === a?.id &&
        detail.type === "practical" &&
        detail.assessment
      ) {
        const updated = detail.assessment as Assessment;
        apply(updated);
        setSavedScores(serializeRows(updated.practical?.rubricScores ?? []));
        setFinalPractical(String(updated.practical?.rubricScore ?? 0));
        setDeviceDraft(undefined);
        setNotice("Practical scores saved.");
      }
    };
    changed();
    window.addEventListener("dakshsetu:offline-change", changed);
    window.addEventListener("dakshsetu:sync-complete", synced);
    return () => {
      window.removeEventListener("dakshsetu:offline-change", changed);
      window.removeEventListener("dakshsetu:sync-complete", synced);
    };
  }, [user?.id, a?.id, dirty]);
  const changeScore = (criterionId: string, value: number) =>
    setScores((s) => ({
      ...s,
      [criterionId]: {
        score: value,
        remark: s[criterionId]?.remark ?? "",
        evidenceIds: s[criterionId]?.evidenceIds ?? [],
      },
    }));
  const claim = () =>
    run(async () => {
      const { data } = await api.post<Assessment>("/assessments", {
        workerId: id,
      });
      apply(data);
      setNotice(
        "Assessment started. You can now save practical scores and evidence.",
      );
      setTab("assessment");
    });
  const save = () =>
    run(async () => {
      if (!a) return;
      if (!user) return;
      const result = await savePractical(user.id, a, candidate!.user.id, rows);
      if (result.queued) {
        setSavedScores(serializeRows(rows));
        setFinalPractical(String(practicalScore));
        setNotice(
          "Saved on this device. Practical scores will sync when the connection returns.",
        );
        return;
      }
      const data = result.assessment;
      apply(data);
      setSavedScores(serializeRows(rows));
      setFinalPractical(String(data.practical!.rubricScore));
      setRecommendation("");
      setNotice("Practical scores saved.");
    });
  const selectFile = (selected: File | undefined) => {
    setError("");
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    setFile(selected);
    uploadId.current = crypto.randomUUID();
  };
  const upload = () =>
    run(async () => {
      if (!a || !file) return;
      if (!user) return;
      const result = await queueMedia(
        user.id,
        a,
        candidate!.user.id,
        file,
        uploadId.current,
      );
      if (result.queued) {
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        setNotice(
          "Media saved on this device. It will upload when the connection returns.",
        );
        return;
      }
      if (!result.evidence) {
        apply(result.assessment);
        setFile(null);
        setNotice("Evidence uploaded and saved.");
        return;
      }
      const data = { assessment: result.assessment, evidence: result.evidence };
      if (
        serializeRows(data.assessment.practical?.rubricScores ?? []) !==
        savedScores
      ) {
        const draft = await getDraft(user.id, "practical", a.id);
        if (draft) setDeviceDraft(draft);
      }
      setCandidate((c) =>
        c
          ? {
              ...c,
              assessment: data.assessment,
              evidence: [
                ...c.evidence.filter((e) => e.id !== data.evidence.id),
                data.evidence,
              ],
            }
          : c,
      );
      setSelectedEvidence(data.evidence.id);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice("Evidence uploaded and saved.");
    });
  const observe = () =>
    run(async () => {
      if (!a) return;
      setAIError("");
      try {
        const { data } = await api.post<Assessment>("/ai/analyze-evidence", {
          assessmentId: a.id,
          evidenceId: selectedEvidence,
          baseVersion: a.version,
        });
        apply(data);
        setNotice(
          "AI observation saved. Review its limitations before making your decision.",
        );
      } catch (e) {
        if ((e as { response?: { status: number } }).response?.status === 503) {
          setAIError(
            "AI analysis is unavailable. You can retry, or continue with your own observations and practical scoring.",
          );
        } else throw e;
      }
    });
  const finalize = () =>
    run(async () => {
      if (!a) return;
      const { data } = await api.post<Assessment>(
        `/assessments/${a.id}/finalize`,
        {
          baseVersion: a.version,
          assessorScore: finalValue,
          recommendation: chosenRecommendation,
          overrideReason: reason,
          confirmed,
        },
      );
      apply(data);
      setNotice("Assessment signed off. The record is now locked.");
    });
  if (loading)
    return (
      <Workspace
        title={tr("Candidate assessment")}
        description={tr(
          "Loading the worker’s experience and assessment records.",
        )}
      >
        <Loading />
      </Workspace>
    );
  if (!candidate || !a)
    return (
      <Workspace
        title={tr("Candidate assessment")}
        description={tr("Review the candidate’s practical skills.")}
      >
        <ErrorNotice message={tr(error)} />
        <button className="button" onClick={() => void load()}>
          {tr("Try again")}
        </button>
      </Workspace>
    );
  const observation = a.aiObservation;
  return (
    <Workspace
      title={candidate.user.name}
      description={tr(
        "{trade} · {years} years of experience · {qualification}",
        {
          trade: tr(candidate.profile.trade),
          years: candidate.profile.yearsExperience,
          qualification: tr(candidate.qualification.title),
        },
      )}
      eyebrow={tr("CANDIDATE ASSESSMENT")}
    >
      <Link className="text-button back-to-list" to="/assessor/candidates">
        <ArrowLeft size={17} />
        {tr("All candidates")}
      </Link>
      <div className="candidate-summary">
        <div>
          <div className="section-label">{tr("EXPERIENCE TO RECOGNITION")}</div>
          <h2>{tr(candidate.profile.trade)}</h2>
        </div>
        <div>
          <small>{tr("Qualification match")}</small>
          <strong>{tr(candidate.profile.matchScore ?? 0)}%</strong>
        </div>
        <div>
          <small>{tr("Self-assessment")}</small>
          <strong>{tr(a.selfAssessmentScore)}%</strong>
        </div>
        <StatusPill status={a.status} />
      </div>
      {!a.assessorId && (
        <div className="claim-banner">
          <div>
            <strong>{tr("Ready for a practical assessment")}</strong>
            <p>
              {tr(
                "Start the assessment to take responsibility for this candidate’s review.",
              )}
            </p>
          </div>
          <button className="button" disabled={busy} onClick={claim}>
            {tr(
              busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <ClipboardCheck size={18} />
              ),
            )}
            {tr("Start assessment")}
          </button>
        </div>
      )}
      {locked && (
        <div className="locked-banner">
          <LockKeyhole size={22} />
          <div>
            <strong>
              {tr("Signed off by ")}
              {candidate.assessorName ?? user?.name}
            </strong>
            <p>
              {tr(
                new Date(a.signedOffAt!).toLocaleString(tr.locale, {
                  timeZone: "Asia/Kolkata",
                }),
              )}{" "}
              {tr("· This assessment is locked.")}
            </p>
          </div>
        </div>
      )}
      <ErrorNotice message={tr(error)}>
        {conflict && (
          <button className="text-button" onClick={() => void load()}>
            {tr("Reload assessment (discards unsaved edits)")}
          </button>
        )}
      </ErrorNotice>
      {pendingSync && (
        <div className="notice">
          <p>
            {tr(
              "Device changes are waiting to sync. Sign-off is unavailable until they are resolved.",
            )}
          </p>
          <button
            className="text-button"
            disabled={!online}
            onClick={() => void load()}
          >
            {tr("Review saved progress")}
          </button>
        </div>
      )}
      {deviceDraft && deviceDraft.baseVersion !== a.version && (
        <section className="workspace-panel device-conflict">
          <h2>{tr("Review the device draft")}</h2>
          <p>
            {tr(
              "The server record changed. Compare both versions before choosing which scores to use.",
            )}
          </p>
          <div className="table-scroll">
            <table className="candidate-table">
              <thead>
                <tr>
                  <th>{tr("Criterion")}</th>
                  <th>{tr("Server")}</th>
                  <th>{tr("Device")}</th>
                </tr>
              </thead>
              <tbody>
                {rubric.map((r) => (
                  <tr key={r.id}>
                    <td>{tr(r.criterion)}</td>
                    <td>
                      {a.practical?.rubricScores.find(
                        (s) => s.criterionId === r.id,
                      )?.score ?? "—"}
                    </td>
                    <td>
                      {(
                        deviceDraft.payload as { rubricScores: RubricScore[] }
                      ).rubricScores.find((s) => s.criterionId === r.id)
                        ?.score ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="button outline"
            disabled={locked || !online}
            onClick={() =>
              void run(async () => {
                if (!user) return;
                const rows = (
                  deviceDraft.payload as { rubricScores: RubricScore[] }
                ).rubricScores;
                await discardResource(user.id, a.id);
                setDeviceDraft(undefined);
                setScores(toScores(rows));
                setNotice(
                  "Device scores restored. Review and save them against the latest server record.",
                );
              })
            }
          >
            {tr("Use device scores")}
          </button>
          <button
            className="text-button"
            onClick={() =>
              void run(async () => {
                if (!user) return;
                await discardResource(user.id, a.id);
                setDeviceDraft(undefined);
                setScores(toScores(a.practical?.rubricScores ?? []));
                setNotice("Server scores kept.");
              })
            }
          >
            {tr("Keep server scores")}
          </button>
        </section>
      )}
      {notice && (
        <div className="notice success-notice" role="status">
          <CheckCircle2 size={20} />
          {tr(notice)}
        </div>
      )}
      <nav className="candidate-tabs" aria-label={tr("Candidate sections")}>
        {["overview", "skills", "assessment", "evidence", "recommendation"].map(
          (value) => (
            <button
              key={value}
              aria-current={tab === value ? "page" : undefined}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {tr(value[0].toUpperCase() + value.slice(1))}
              {value === "assessment" && dirty && (
                <span
                  className="unsaved-dot"
                  aria-label={tr("Unsaved scores")}
                />
              )}
            </button>
          ),
        )}
      </nav>
      {tab === "overview" && (
        <div className="candidate-overview-grid">
          <section className="workspace-panel">
            <div className="section-label">{tr("01 · THEIR EXPERIENCE")}</div>
            <h2>{tr("In the worker’s own words")}</h2>
            <blockquote>{candidate.profile.experienceDescription}</blockquote>
            <dl className="candidate-facts">
              <div>
                <dt>{tr("Worker")}</dt>
                <dd>{candidate.user.name}</dd>
              </div>
              <div>
                <dt>{tr("Trade")}</dt>
                <dd>{tr(candidate.profile.trade)}</dd>
              </div>
              <div>
                <dt>{tr("Declared experience")}</dt>
                <dd>
                  {tr(candidate.profile.yearsExperience)}
                  {tr(" years")}
                </dd>
              </div>
              <div>
                <dt>{tr("Preferred language")}</dt>
                <dd>
                  {tr(
                    { en: "English", hi: "हिंदी", mr: "मराठी" }[
                      candidate.user.preferredLanguage
                    ],
                  )}
                </dd>
              </div>
            </dl>
          </section>
          <section className="workspace-panel qualification-summary">
            <span className="pale-icon">
              <Zap size={28} />
            </span>
            <h2>{tr(candidate.qualification.title)}</h2>
            <p>{tr(candidate.qualification.code)}</p>
            <strong>
              {tr("NSQF Level ")}
              {tr(candidate.qualification.nsqfLevel)}
              {tr(" (demo)")}
            </strong>
            <div className="demo-disclosure">
              {tr("Demo qualification · Unverified prototype data")}
            </div>
            <button className="text-button" onClick={() => setTab("skills")}>
              {tr("Review confirmed skills")}
              <ArrowRight size={17} />
            </button>
          </section>
        </div>
      )}
      {tab === "skills" && (
        <section className="workspace-panel">
          <div className="section-label">{tr("02 · SKILL PROFILE")}</div>
          <h2>{tr("Confirmed by the worker")}</h2>
          <p>
            {tr(
              "The worker reviewed these skills before qualification matching.",
            )}
          </p>
          <div className="skill-tags assessor-skills">
            {candidate.profile.confirmedSkills.map((s) => (
              <span key={s}>
                <Check size={17} />
                {tr(s)}
              </span>
            ))}
          </div>
          <h3 className="subsection-title">
            {tr("Originally suggested by AI")}
          </h3>
          <div className="skill-tags gaps assessor-skills">
            {candidate.profile.detectedSkills.length ? (
              candidate.profile.detectedSkills.map((s) => (
                <span key={s}>{tr(s)}</span>
              ))
            ) : (
              <p>{tr("Manual skill selection was used.")}</p>
            )}
          </div>
        </section>
      )}
      {tab === "assessment" && (
        <section className="workspace-panel">
          <div className="panel-heading">
            <div>
              <div className="section-label">{tr("03 · PRACTICAL RUBRIC")}</div>
              <h2>{tr(a.taskTitle ?? practicalTask)}</h2>
              <p>
                {tr(
                  "Score what you observe. Unscored criteria remain incomplete.",
                )}
              </p>
            </div>
            <span className="rubric-total">
              <strong>{tr(practicalScore)}%</strong>
              <small>
                {tr(rows.length)} / {tr(rubric.length)}
                {tr(" scored")}
              </small>
            </span>
          </div>
          <div className="scoring-legend">
            {tr(
              "0 = Not demonstrated · 1 = Partially · 2 = With assistance · 3 = Independently",
            )}
          </div>
          {!!safetyWarnings(rows, a.rubricVersion ?? 1, a.rubricSnapshot)
            .length && (
            <div className="notice warning" role="alert">
              {tr(
                "Critical safety warning: review low-scored mandatory safety criteria before deciding. This warning does not automatically fail the worker.",
              )}
            </div>
          )}
          {["Safety", "Procedure", "Testing"].map((section) => (
            <div className="rubric-section" key={section}>
              <h3>{tr(section)}</h3>
              {rubric
                .filter((r) => r.section === section)
                .map((r) => (
                  <fieldset
                    className="rubric-row"
                    key={r.id}
                    disabled={!canEdit || busy}
                  >
                    <legend>
                      <span>
                        {tr(r.criterion)}
                        {r.mandatory && <small> · {tr("Mandatory")}</small>}
                      </span>
                      <small>
                        {tr("Weight ")}
                        {tr(r.weight)}%
                      </small>
                    </legend>
                    <div className="score-choices">
                      {scoreLabels.map((label, value) => (
                        <label
                          key={value}
                          className={
                            scores[r.id]?.score === value ? "selected" : ""
                          }
                        >
                          <input
                            type="radio"
                            name={`rubric-${r.id}`}
                            aria-label={`${value} ${tr(label)}`}
                            checked={scores[r.id]?.score === value}
                            onChange={() => changeScore(r.id, value)}
                          />
                          <strong>{tr(value)}</strong>
                          <span>{tr(label)}</span>
                        </label>
                      ))}
                    </div>
                    <label className="rubric-remark">
                      {tr("Observation / remark (optional)")}
                      <input
                        maxLength={500}
                        value={scores[r.id]?.remark ?? ""}
                        disabled={scores[r.id] === undefined}
                        onChange={(e) =>
                          setScores((s) => ({
                            ...s,
                            [r.id]: { ...s[r.id], remark: e.target.value },
                          }))
                        }
                        placeholder={tr("A brief note from the practical")}
                      />
                    </label>
                    <VoiceNote
                      disabled={!canEdit || scores[r.id] === undefined}
                      onText={(text) =>
                        setScores((s) =>
                          s[r.id]
                            ? {
                                ...s,
                                [r.id]: {
                                  ...s[r.id],
                                  remark: (
                                    (s[r.id].remark
                                      ? s[r.id].remark + " "
                                      : "") + text
                                  ).slice(0, 500),
                                },
                              }
                            : s,
                        )
                      }
                    />
                    {!!candidate.evidence.length && (
                      <label>
                        {tr("Evidence for this criterion")}
                        <select
                          multiple
                          disabled={scores[r.id] === undefined}
                          aria-label={
                            tr("Evidence for this criterion") +
                            " · " +
                            tr(r.criterion)
                          }
                          value={scores[r.id]?.evidenceIds ?? []}
                          onChange={(e) =>
                            setScores((s) => ({
                              ...s,
                              [r.id]: {
                                ...s[r.id],
                                evidenceIds: Array.from(
                                  e.target.selectedOptions,
                                  (o) => o.value,
                                ),
                              },
                            }))
                          }
                        >
                          {candidate.evidence.map((e, index) => (
                            <option key={e.id} value={e.id}>
                              {index + 1} · {e.filename}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </fieldset>
                ))}
            </div>
          ))}
          <div className="assessment-save-bar">
            <span>
              {tr(
                locked
                  ? "Signed-off scores are locked."
                  : dirty
                    ? "You have unsaved practical scores."
                    : "Practical scores are up to date.",
              )}
            </span>
            <button
              className="button"
              onClick={save}
              disabled={!canEdit || busy || !dirty}
            >
              {tr(
                busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Save size={18} />
                ),
              )}
              {tr("Save practical scores")}
            </button>
          </div>
        </section>
      )}
      {tab === "evidence" && (
        <>
          <AIReviewDecision
            key={a.aiObservation?.createdAt}
            assessment={a}
            canEdit={canEdit && online && !dirty && !pendingSync}
            onSaved={(assessment) =>
              setCandidate((c) => (c ? { ...c, assessment } : c))
            }
          />
          <section className="workspace-panel">
            <div className="section-label">{tr("04 · PRACTICAL EVIDENCE")}</div>
            <h2>{tr("Make the work visible.")}</h2>
            <p>
              {tr(
                "Upload a clear image of the candidate’s practical task. Images are private and visible only to the worker and assigned assessor.",
              )}
            </p>
            {canEdit && (
              <>
                <label className="evidence-upload">
                  <ImagePlus size={32} />
                  <strong>{tr("Choose practical evidence")}</strong>
                  <span>
                    {tr("JPEG, PNG, or WebP · Maximum 5 MB · Up to 6 images")}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    className="sr-only"
                    aria-label={tr("Choose practical evidence")}
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => selectFile(e.target.files?.[0])}
                    disabled={busy || a.evidenceIds.length >= 6}
                  />
                </label>
                {preview && (
                  <div className="upload-preview">
                    <img src={preview} alt={tr("Selected evidence preview")} />
                    <div>
                      <strong>{file?.name}</strong>
                      <p>
                        {tr(
                          "Images are resized if needed and stripped of EXIF metadata before storage.",
                        )}
                      </p>
                      <button
                        className="button"
                        onClick={upload}
                        disabled={busy}
                      >
                        {tr(
                          busy ? (
                            <LoaderCircle className="spin" size={18} />
                          ) : (
                            <Upload size={18} />
                          ),
                        )}
                        {tr(
                          online
                            ? "Upload evidence"
                            : "Save evidence on device",
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="evidence-grid">
              {candidate.evidence.map((e) => (
                <article key={e.id} className="evidence-card">
                  <EvidenceImage evidence={e} assessmentId={a.id} />
                  <strong>{e.filename}</strong>
                  <small>
                    {tr("Uploaded ")}
                    {tr(new Date(e.createdAt).toLocaleDateString(tr.locale))}
                  </small>
                  <span className="evidence-saved">
                    <CheckCircle2 size={14} />
                    {tr("Saved evidence")}
                  </span>
                </article>
              ))}
            </div>
            {!candidate.evidence.length && (
              <div className="empty-state">
                <ImagePlus size={28} />
                <p>{tr("No evidence uploaded yet.")}</p>
              </div>
            )}
          </section>
          <section className="workspace-panel ai-panel">
            <div className="panel-heading">
              <div>
                <div className="section-label">
                  <Sparkles size={17} />
                  {tr("AI SECOND ASSESSOR")}
                </div>
                <h2>{tr("AI observation")}</h2>
                <p>{tr("Suggested only · You make the final decision.")}</p>
              </div>
              <span className="neutral-pill">
                {tr("Visible evidence only")}
              </span>
            </div>
            {candidate.evidence.length > 0 && canEdit && (
              <div className="ai-controls">
                <label>
                  {tr("Evidence to observe")}
                  <select
                    value={selectedEvidence}
                    onChange={(e) => setSelectedEvidence(e.target.value)}
                    disabled={busy}
                  >
                    {candidate.evidence.map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.filename}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button outline"
                  onClick={observe}
                  disabled={!online || busy || !selectedEvidence}
                >
                  {tr(
                    busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <Sparkles size={18} />
                    ),
                  )}
                  {tr("Run AI observation")}
                </button>
              </div>
            )}
            {aiError && (
              <div className="notice" role="status">
                <AlertTriangle size={20} />
                {tr(aiError)}
              </div>
            )}
            {observation ? (
              <>
                <div className="ai-score">
                  <div>
                    <strong>
                      {tr(observation.suggestedScore)}
                      <small> / 10</small>
                    </strong>
                    <span>{tr("AI suggested score")}</span>
                  </div>
                  <p>{observation.summary}</p>
                </div>
                <p className="subtle">
                  {tr("Observed image:")}{" "}
                  {tr(
                    candidate.evidence.find(
                      (e) => e.id === observation.evidenceId,
                    )?.filename ?? observation.evidenceId,
                  )}
                </p>
                <div className="ai-observations">
                  {observation.observations.map((o) => (
                    <div key={o.criterionId} className={o.status}>
                      {tr(
                        o.status === "observed" ? (
                          <CheckCircle2 size={19} />
                        ) : o.status === "warning" ? (
                          <AlertTriangle size={19} />
                        ) : (
                          <MinusCircle size={19} />
                        ),
                      )}
                      <span>
                        <strong>{tr(o.criterion)}</strong>
                        {o.evidence && <p>{o.evidence}</p>}
                        <small>
                          {tr(o.status)} · {tr(Math.round(o.confidence * 100))}
                          {tr("% confidence in observation")}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                {observation.warnings.length > 0 && (
                  <div className="ai-limitations warning">
                    <h3>{tr("Warnings to review")}</h3>
                    <ul>
                      {observation.warnings.map((w) => (
                        <li key={w}>{tr(w)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="ai-limitations">
                  <h3>{tr("What this image cannot tell us")}</h3>
                  <ul>
                    {observation.limitations.map((l) => (
                      <li key={l}>{tr(l)}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="notice">
                <Eye size={22} />
                {tr(
                  "No AI observation is saved. AI analysis is optional; you can continue with your own practical assessment.",
                )}
              </div>
            )}
          </section>
        </>
      )}
      {tab === "evidence" && (
        <VideoReview
          assessment={a}
          workerId={candidate.user.id}
          canEdit={canEdit}
          onUpdated={apply}
        />
      )}
      {tab === "recommendation" && (
        <section className="workspace-panel">
          <div className="section-label">{tr("05 · HUMAN DECISION")}</div>
          <div className="panel-heading">
            <div>
              <h2>
                {tr(
                  locked
                    ? "Your signed-off recommendation"
                    : "Review. Decide. Confirm.",
                )}
              </h2>
              <p>
                {tr(
                  locked
                    ? "This result is saved in the assessment record."
                    : "Compare the evidence and rubric before making your final decision.",
                )}
              </p>
            </div>
            {tr(locked && <LockKeyhole size={28} />)}
          </div>
          <div className="review-score-grid">
            <div>
              <small>{tr("Self-assessment")}</small>
              <strong>{tr(a.selfAssessmentScore)}%</strong>
              <span>
                {Math.round((a.scoringPolicy?.selfWeight ?? 0.3) * 100)}
                {tr("% of overall score")}
              </span>
            </div>
            <div>
              <small>{tr("Saved rubric score")}</small>
              <strong>
                {tr(a.practical?.rubricScore ?? "—")}
                {tr(a.practical ? "%" : "")}
              </strong>
              <span>
                {tr(a.practical?.rubricScores.length ?? 0)}
                {tr(" / 8 criteria saved")}
              </span>
            </div>
            <div>
              <small>{tr("AI suggestion")}</small>
              <strong>
                {tr(
                  a.aiSuggestedScore === undefined
                    ? "—"
                    : `${a.aiSuggestedScore}%`,
                )}
              </strong>
              <span>
                {tr(
                  a.aiSuggestedScore === undefined
                    ? "Manual review is available"
                    : "Advisory only",
                )}
              </span>
            </div>
          </div>
          {dirty && (
            <div className="notice">
              <AlertTriangle size={20} />
              {tr(
                "Save your practical scores in the Assessment tab before finalising.",
              )}
            </div>
          )}
          {!complete && (
            <p className="review-prerequisite">
              {tr("All eight practical criteria must be scored and saved.")}
            </p>
          )}
          {!candidate.evidence.length && (
            <p className="review-prerequisite">
              {tr("Upload at least one practical evidence image.")}
            </p>
          )}
          <fieldset className="final-form" disabled={!canEdit || busy}>
            <label>
              {tr("Final practical score (0–100)")}
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={finalPractical}
                onChange={(e) => setFinalPractical(e.target.value)}
              />
              <small>
                {tr(
                  "Your approved practical score. Any change from the rubric must be explained.",
                )}
              </small>
            </label>
            <div className="overall-score">
              <div>
                <small>{tr("Overall competency score")}</small>
                <strong>
                  {tr(locked ? a.finalScore : validScore ? overall : "—")}
                  {tr((locked || validScore) && "%")}
                </strong>
              </div>
              <p>
                {tr("Prototype scoring configuration")}
                <br />
                <strong>
                  {tr(
                    "Self-assessment {self}% + final practical score {practical}%",
                    {
                      self: Math.round(
                        (a.scoringPolicy?.selfWeight ?? 0.3) * 100,
                      ),
                      practical: Math.round(
                        (a.scoringPolicy?.practicalWeight ?? 0.7) * 100,
                      ),
                    },
                  )}
                </strong>
              </p>
            </div>
            <label>
              {tr("Final recommendation")}
              <select
                value={chosenRecommendation}
                onChange={(e) => setRecommendation(e.target.value)}
              >
                {recommendations.map((r) => (
                  <option value={r} key={r}>
                    {tr(r)}
                  </option>
                ))}
              </select>
            </label>
            <p className="subtle">
              {tr(
                "Prototype rules: ≥75 Competent · 60–74 Minor skill-gap training · <60 Further assessment required. These are configurable demo rules.",
              )}
            </p>
            <label>
              {tr(
                adjustment
                  ? "Reason for your adjustment (required)"
                  : "Assessor notes / adjustment reason",
              )}
              <textarea
                rows={4}
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                placeholder={tr(
                  "Explain what you observed and why your judgment differs.",
                )}
              />
              {adjustment && (
                <small>
                  {tr(
                    "A difference of more than 20 points from the AI suggestion, a changed rubric score, or a changed recommendation requires at least 10 characters.",
                  )}
                </small>
              )}
            </label>
            <label className="signoff-check">
              <input
                type="checkbox"
                checked={locked || confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                {tr(
                  "I confirm that I have reviewed the practical evidence and made this assessment.",
                )}
              </span>
            </label>
            {!locked && (
              <button
                className="button"
                onClick={finalize}
                disabled={
                  busy ||
                  !online ||
                  pendingSync ||
                  !complete ||
                  dirty ||
                  !candidate.evidence.length ||
                  !validScore ||
                  !confirmed ||
                  (adjustment && reason.trim().length < 10)
                }
              >
                {tr(
                  busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <ShieldCheck size={19} />
                  ),
                )}
                {tr("Finalise assessment")}
              </button>
            )}
          </fieldset>
          {locked && (
            <div className="final-decision">
              <CheckCircle2 size={26} />
              <div>
                <strong>{tr(a.recommendation)}</strong>
                <p>{tr("Assessor verified · Not a government certificate")}</p>
                <Link className="button outline" to={"/passports/" + a.id}>
                  {tr("View Skill Passport")}
                </Link>
              </div>
            </div>
          )}
          {a.history.length > 0 && (
            <details className="assessment-history">
              <summary>{tr("Assessment history")}</summary>
              <ol>
                {a.history.map((h, i) => (
                  <li key={i}>
                    <strong>
                      {tr(h.action.replaceAll("_", " ").toLowerCase())}
                    </strong>
                    <time>
                      {tr(
                        new Date(h.at).toLocaleString(tr.locale, {
                          timeZone: "Asia/Kolkata",
                        }),
                      )}
                    </time>
                    {h.reason && <p>{h.reason}</p>}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}
    </Workspace>
  );
}
