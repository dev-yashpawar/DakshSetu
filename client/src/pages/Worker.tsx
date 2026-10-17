import { useTranslate } from "../localization";
import "../locales/register-practical";
import { useEffect, useRef, useState } from "react";
import {
  getDraft,
  saveDraft,
  queueDeclaration,
  submitSelf,
  pendingItems,
  discardResource,
} from "../services/offline";
import { useConnectivity } from "../components/OfflineStatus";
import { WorkerOutcome } from "../components/WorkerOutcome";
import { createSpeechCapture, speechConstructor, type SpeechCapture } from "../services/speech";
import { RecordedVoice } from "../components/RecordedVoice";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Zap,
  Wrench,
  Hammer,
  Flame,
  BrickWall,
  Scissors,
  Mic,
  MicOff,
  Plus,
  X,
  ShieldCheck,
  ClipboardCheck,
  ChevronDown,
  LoaderCircle,
  UserRound,
  ArrowLeft,
} from "lucide-react";
import { api, errorMessage } from "../services/api";
import { useCopy, useSession } from "../store/session";
import {
  Actions,
  Choice,
  ErrorNotice,
  Loading,
  StepTitle,
} from "../components/common";
import { tradeNames, skillNames, localQuestions } from "../i18n";
import { experienceSchema } from "../../../shared/validation";
import type {
  Assessment,
  Match,
  Profile,
  Question,
  WorkerState,
} from "../../../shared/types";

const tradeIcons = [Zap, Wrench, Hammer, Flame, BrickWall, Scissors];
const skillOptions = [
  "Residential Wiring",
  "MCB Installation",
  "Switch Installation",
  "Fault Diagnosis",
  "Safety Practices",
  "Testing",
];
const years = [0.5, 2, 4, 8];
type SafeQuestion = Omit<Question, "correctAnswer">;
const routeNames = [
  "trade",
  "years",
  "describe",
  "skills",
  "match",
  "quiz",
  "result",
];
function initialStep(data: WorkerState) {
  const p = data.profile;
  if (data.assessment) return "result";
  if (p.selectedQualificationId) return "match";
  if (p.confirmedSkills.length || p.detectedSkills.length) return "skills";
  if (p.experienceDescription.length >= 15) return "describe";
  if (p.trade) return "years";
  return "trade";
}

export function Start() {
  const tr = useTranslate();

  const { user, language, supportedLanguages, setLanguage } = useSession(),
    t = useCopy(),
    navigate = useNavigate();
  return (
    <main className="worker-main container narrow">
      <StepTitle
        number="01"
        label={tr("LET’S GET STARTED")}
        title={t.chooseLanguage}
        help={t.languageHelp}
      />
      <div className="language-choices">
        {(
          [
            { id: "en", letter: "A", name: "English", sub: "English" },
            { id: "hi", letter: "अ", name: "हिंदी", sub: "Hindi" },
            { id: "mr", letter: "म", name: "मराठी", sub: "Marathi" },
          ] as const
        )
          .filter((l) =>
            (supportedLanguages ?? ["en", "hi", "mr"]).includes(l.id),
          )
          .map((l) => (
            <Choice
              key={l.id}
              selected={language === l.id}
              icon={<span className="language-letter">{tr(l.letter)}</span>}
              title={tr(l.name)}
              subtitle={tr(l.sub)}
              onClick={() => setLanguage(l.id)}
            />
          ))}
      </div>
      <Actions
        onBack={() => navigate("/")}
        onNext={() => navigate(user ? "/worker" : "/login?from=start")}
      />
      <div className="worker-footnote">
        <ShieldCheck size={15} />
        {tr("DakshSetu · Recognition of Prior Learning")}
      </div>
    </main>
  );
}

export function Worker() {
  const online = useConnectivity();
  const [quizRestored, setQuizRestored] = useState(false),
    [quizConflict, setQuizConflict] = useState(false),
    [queuedSelf, setQueuedSelf] = useState(false);
  const [declarationBase, setDeclarationBase] = useState<number | null>(null);
  const tr = useTranslate();

  const t = useCopy(),
    { language, user } = useSession(),
    navigate = useNavigate(),
    { step } = useParams();
  const [data, setData] = useState<WorkerState | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loadError, setLoadError] = useState("");
  const [trade, setTrade] = useState(""),
    [year, setYear] = useState<number | null>(null),
    [description, setDescription] = useState(""),
    [voiceUsed, setVoiceUsed] = useState(false),
    [selectedSkills, setSelectedSkills] = useState<string[]>([]),
    [custom, setCustom] = useState(""),
    [manual, setManual] = useState(false),
    [notice, setNotice] = useState(""),
    [match, setMatch] = useState<Match | null>(null);
  const [questions, setQuestions] = useState<SafeQuestion[]>([]),
    [answers, setAnswers] = useState<Record<string, number>>({}),
    [questionIndex, setQuestionIndex] = useState(0),
    [review, setReview] = useState(false),
    [recording, setRecording] = useState(false);
  const [interimSpeech, setInterimSpeech] = useState("");
  const [recordedVoice, setRecordedVoice] = useState(false);
  const recognition = useRef<SpeechCapture | null>(null),
    titleRef = useRef<HTMLDivElement>(null);
  const current = step ?? "trade";
  useEffect(() => {
    if (current !== "describe" || loading || !data || data.assessment || !user)
      return;
    const timer = window.setTimeout(() => {
      void saveDraft(
        user.id,
        "declaration",
        data.profile.id,
        {
          experienceDescription: description,
          yearsExperience: year ?? 0,
          trade: "Electrician",
          declarationSource: voiceUsed ? "voice" : "text",
        },
        declarationBase ?? data.profile.version,
      ).catch((e) => setError(errorMessage(e)));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    current,
    loading,
    data?.profile.id,
    data?.assessment?.id,
    user?.id,
    description,
    year,
    voiceUsed,
    declarationBase,
  ]);
  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data: state } = await api.get<WorkerState>("/workers/me");
      setData(state);
      setTrade(state.profile.trade);
      setYear(
        state.profile.yearsExperience > 0
          ? state.profile.yearsExperience
          : null,
      );
      const draft = await getDraft(
        state.user.id,
        "declaration",
        state.profile.id,
      );
      const declaration = draft?.payload as
        | {
            experienceDescription?: string;
            yearsExperience?: number;
            declarationSource?: string;
          }
        | undefined;
      setDescription(
        declaration?.experienceDescription ??
          state.profile.experienceDescription,
      );
      if (declaration?.yearsExperience !== undefined)
        setYear(declaration.yearsExperience);
      setVoiceUsed(declaration?.declarationSource === "voice");
      setDeclarationBase(draft?.baseVersion ?? state.profile.version);
      setSelectedSkills(
        state.profile.confirmedSkills.length
          ? state.profile.confirmedSkills
          : state.profile.detectedSkills,
      );
      if (!step) navigate(`/worker/${initialStep(state)}`, { replace: true });
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      recognition.current?.abort();
    };
  }, [user?.id]);
  useEffect(() => {
    const synced = (event: Event) => {
      if (["self", "declaration"].includes((event as CustomEvent).detail?.type))
        void load();
    };
    window.addEventListener("dakshsetu:sync-complete", synced);
    return () => window.removeEventListener("dakshsetu:sync-complete", synced);
  }, [user?.id, step]);
  useEffect(() => {
    setError("");
    setNotice("");
    setReview(false);
    setQuestionIndex(0);
    recognition.current?.stop();
    setRecording(false);
    titleRef.current?.focus();
    window.scrollTo(0, 0);
  }, [current]);
  useEffect(() => {
    recognition.current?.abort();
    setRecording(false);
    setInterimSpeech("");
  }, [language]);
  // Reloading a later step restores its server data and enforces the same prerequisites as the API.
  useEffect(() => {
    if (!data || loading) return;
    if (data.assessment && current !== "result") {
      navigate("/worker/result", { replace: true });
      return;
    }
    if (current === "result" && !data.assessment) {
      navigate(`/worker/${initialStep(data)}`, { replace: true });
      return;
    }
    if (!routeNames.includes(current)) {
      navigate(`/worker/${initialStep(data)}`, { replace: true });
      return;
    }
    if (
      ["years", "describe", "skills", "match", "quiz"].includes(current) &&
      !data.profile.trade
    ) {
      navigate("/worker/trade", { replace: true });
      return;
    }
    if (
      ["skills", "match", "quiz"].includes(current) &&
      data.profile.experienceDescription.length < 15
    ) {
      navigate("/worker/describe", { replace: true });
      return;
    }
    if (current === "match" && !data.profile.selectedQualificationId) {
      navigate("/worker/skills", { replace: true });
      return;
    }
    if (current === "quiz" && !data.profile.selectedQualificationId) {
      navigate("/worker/skills", { replace: true });
      return;
    }
    if (current === "match" && data.profile.selectedQualificationId) {
      void api
        .get("/qualifications/" + data.profile.selectedQualificationId)
        .then(({ data: q }) =>
          setMatch(
            (prev) =>
              prev ??
              data.profile.matchDetails ?? {
                qualification: q,
                matchScore: data.profile.matchScore ?? 0,
                matchedSkills: q.skills.filter((s: string) =>
                  data.profile.confirmedSkills.includes(s),
                ),
                gaps: q.skills.filter(
                  (s: string) => !data.profile.confirmedSkills.includes(s),
                ),
                explanation:
                  "Prototype match: skill overlap 60%, task relevance 20%, and experience 20%.",
              },
          ),
        )
        .catch((e) => setError(errorMessage(e)));
    }
    if (current === "quiz" && data.profile.selectedQualificationId) {
      void api
        .get<SafeQuestion[]>(
          "/self-assessment/questions/" + data.profile.selectedQualificationId,
        )
        .then(({ data: q }) => setQuestions(q))
        .catch((e) => setError(errorMessage(e)));
    }
  }, [current, data?.profile.version, loading]);
  const update = (profile: Profile) =>
    setData((d) => (d ? { ...d, profile } : d));
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
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
  const saveProfile = async (
    changes: Record<string, unknown>,
    next: string,
  ) => {
    const { data: p } = await api.put<Profile>("/workers/me", changes);
    update(p);
    navigate("/worker/" + next);
  };
  const saveExperience = async () => {
    const input = experienceSchema.parse({
      experienceDescription: description,
      trade: "Electrician",
      yearsExperience: year ?? 0,
      declarationSource: voiceUsed ? "voice" : "text",
    });
    if (!online)
      throw Error(
        "Save your experience on this device and reconnect to continue skill extraction.",
      );
    const { data: p } = await api.post<Profile>("/workers/experience", input);
    if (data && user) await discardResource(user.id, data.profile.id);
    setDeclarationBase(p.version);
    update(p);
    return input;
  };
  const analyse = () =>
    run(async () => {
      const valid = experienceSchema.safeParse({
        experienceDescription: description,
        trade: "Electrician",
        yearsExperience: year ?? 0,
      });
      if (!valid.success) {
        setError(valid.error.issues[0].message);
        return;
      }
      const input = await saveExperience();
      try {
        const { data: result } = await api.post<{ skills: string[] }>(
          "/ai/extract-skills",
          input,
        );
        setSelectedSkills(result.skills);
        setManual(false);
        const { data: state } = await api.get<WorkerState>("/workers/me");
        setData(state);
        navigate("/worker/skills");
        if (!result.skills.length) {
          setManual(true);
          setNotice(t.noSkills);
        }
      } catch (e) {
        if ((e as { response?: { status: number } }).response?.status === 503) {
          setManual(true);
          setSelectedSkills([]);
          navigate("/worker/skills");
          setNotice(t.manualNotice);
        } else throw e;
      }
    });
  const manualStart = () =>
    run(async () => {
      const valid = experienceSchema.safeParse({
        experienceDescription: description,
        trade: "Electrician",
        yearsExperience: year ?? 0,
      });
      if (!valid.success) {
        setError(valid.error.issues[0].message);
        return;
      }
      await saveExperience();
      setManual(true);
      setSelectedSkills(data?.profile.confirmedSkills ?? []);
      navigate("/worker/skills");
    });
  const confirmSkills = () =>
    run(async () => {
      if (!selectedSkills.length) {
        setError(t.skillRequired);
        return;
      }
      const { data: p } = await api.put<Profile>("/workers/skills", {
        skills: selectedSkills,
      });
      update(p);
      const { data: result } = await api.post<Match>("/qualifications/match");
      setMatch(result);
      const { data: state } = await api.get<WorkerState>("/workers/me");
      setData(state);
      navigate("/worker/match");
    });
  const toggleSkill = (skill: string) =>
    setSelectedSkills((current) =>
      current.includes(skill)
        ? current.filter((s) => s !== skill)
        : [...current, skill],
    );
  const addCustom = () => {
    const value = custom.trim();
    if (value.length < 2 || value.length > 80) return;
    if (!selectedSkills.some((s) => s.toLowerCase() === value.toLowerCase()))
      setSelectedSkills((s) => [...s, value]);
    setCustom("");
  };
  const speech = () => {
    if (recording) {
      recognition.current?.stop();
      return;
    }
    const Recognition = speechConstructor();
    if (!Recognition) {
      setNotice(t.voiceUnsupported);
      setRecordedVoice(true);
      return;
    }
    try {
      recognition.current?.abort();
      const capture = createSpeechCapture({
        Constructor: Recognition,
        language: { en: "en-IN", hi: "hi-IN", mr: "mr-IN" }[language],
        onFinal: text => { setDescription(prev => (prev + " " + text).trim().slice(0,4000)); setVoiceUsed(true); },
        onInterim: setInterimSpeech, onListening: setRecording,
        onError: message => { setNotice(message); if(/could not connect|unavailable for this language|recognition stopped/.test(message)) setRecordedVoice(true); },
      });
      recognition.current = capture;
      capture.start();
      setNotice("");
    } catch {
      setNotice(t.voiceDenied);
    }
  };
  const submit = () =>
    run(async () => {
      if (questions.some((q) => answers[q.id] === undefined)) {
        setError(t.completeAnswers);
        return;
      }
      if (!data?.profile.selectedQualificationId || !user) return;
      const result = await submitSelf(
        user.id,
        data.profile.selectedQualificationId,
        data.profile.version,
        questions.map((q) => ({
          questionId: q.id,
          answer: answers[q.id],
        })),
      );
      if (result.queued) {
        setQueuedSelf(true);
        setNotice(
          "Saved on this device. Your assessment will submit when the connection returns.",
        );
        return;
      }
      const assessment = result.assessment;
      setData((d) =>
        d
          ? {
              ...d,
              assessment,
              profile: { ...d.profile, status: "SELF_ASSESSED" },
            }
          : d,
      );
      navigate("/worker/result");
    });
  useEffect(() => {
    let active = true;
    setQuizRestored(false);
    setQuizConflict(false);
    if (
      current !== "quiz" ||
      !user ||
      !data?.profile.selectedQualificationId ||
      !questions.length ||
      data.assessment
    )
      return;
    void getDraft(user.id, "quiz", data.profile.selectedQualificationId).then(
      (draft) => {
        if (!active) return;
        if (draft && draft.baseVersion === data.profile.version) {
          const p = draft.payload as {
            answers: Record<string, number>;
            questionIndex: number;
            review: boolean;
          };
          setAnswers(
            Object.fromEntries(
              Object.entries(p.answers ?? {}).filter(
                ([id, value]) =>
                  questions.some((q) => q.id === id) &&
                  Number.isInteger(value) &&
                  value >= 0 &&
                  value < 4,
              ),
            ),
          );
          setQuestionIndex(
            Math.min(Math.max(p.questionIndex ?? 0, 0), questions.length - 1),
          );
          setReview(!!p.review);
          setNotice("Device draft restored.");
        } else if (draft) setQuizConflict(true);
        setQuizRestored(true);
      },
    );
    return () => {
      active = false;
    };
  }, [
    current,
    user?.id,
    data?.profile.selectedQualificationId,
    data?.profile.version,
    questions.length,
  ]);
  useEffect(() => {
    if (
      quizRestored &&
      !quizConflict &&
      current === "quiz" &&
      user &&
      data?.profile.selectedQualificationId &&
      !data.assessment
    )
      void saveDraft(
        user.id,
        "quiz",
        data.profile.selectedQualificationId,
        { answers, questionIndex, review },
        data.profile.version,
      ).catch((e) => setError(e.message));
  }, [
    quizRestored,
    quizConflict,
    current,
    user?.id,
    JSON.stringify(answers),
    questionIndex,
    review,
    data?.profile.version,
  ]);
  useEffect(() => {
    const update = () => {
      if (user && data?.profile.selectedQualificationId)
        void pendingItems(user.id).then((rows) =>
          setQueuedSelf(
            rows.some(
              (i) =>
                i.type === "self" &&
                i.resourceId === data.profile.selectedQualificationId,
            ),
          ),
        );
    };
    update();
    window.addEventListener("dakshsetu:offline-change", update);
    return () => window.removeEventListener("dakshsetu:offline-change", update);
  }, [user?.id, data?.profile.selectedQualificationId]);
  const skillLabel = (s: string) => skillNames[s]?.[language] ?? s;
  const stage = ["trade", "years", "describe"].includes(current)
    ? 1
    : current === "skills"
      ? 2
      : current === "match"
        ? 3
        : 4;
  const labels = [t.language, t.work, t.skillTitle, t.matchTitle, t.assessment];
  const dirty =
    data &&
    ((current === "trade" && trade !== data.profile.trade) ||
      (current === "years" && year !== data.profile.yearsExperience) ||
      (current === "describe" &&
        description !== data.profile.experienceDescription) ||
      (current === "skills" &&
        JSON.stringify(selectedSkills) !==
          JSON.stringify(data.profile.confirmedSkills)) ||
      (current === "quiz" && Object.keys(answers).length > 0));
  if (loading) return <Loading />;
  if (loadError)
    return (
      <main className="container narrow worker-main">
        <ErrorNotice message={tr(loadError)} />
        <button className="button" onClick={() => void load()}>
          {t.retry}
        </button>
      </main>
    );
  if (!data) return null;
  return (
    <>
      <div className="worker-progress">
        <div className="container">
          <div className="journey-label">
            <UserRound size={17} />
            {data.user.name}
            <span>{tr("YOUR SKILL JOURNEY")}</span>
          </div>
          <ol>
            {labels.map((l, i) => (
              <li
                key={i}
                className={i < stage ? "done" : i === stage ? "active" : ""}
              >
                <span>{tr(i < stage ? <Check size={13} /> : i + 1)}</span>
                <small>{tr(l)}</small>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <main className="worker-main container narrow">
        <div ref={titleRef} tabIndex={-1} className="focus-anchor" />
        {current === "quiz" && notice && (
          <div className="notice" role="status">
            {tr(notice)}
          </div>
        )}
        {current === "quiz" && (quizConflict || queuedSelf) && (
          <div className="notice">
            <p>
              {tr(
                quizConflict
                  ? "Your saved profile changed. Review the server record before using this draft."
                  : "Your submission is waiting to sync. No final score is available yet.",
              )}
            </p>
            <button
              className="text-button"
              disabled={!online}
              onClick={() => void load()}
            >
              {tr("Review saved progress")}
            </button>
            {quizConflict && (
              <button
                className="text-button"
                onClick={() => {
                  if (user && data.profile.selectedQualificationId)
                    void discardResource(
                      user.id,
                      data.profile.selectedQualificationId,
                    ).then(() => {
                      setAnswers({});
                      setReview(false);
                      setQuestionIndex(0);
                      setQuizConflict(false);
                    });
                }}
              >
                {tr("Discard device draft")}
              </button>
            )}
          </div>
        )}
        {current === "trade" && (
          <>
            <StepTitle
              number="02"
              label={t.work}
              title={t.tradeQuestion}
              help={t.tradeHelp}
            />
            <div className="trade-grid">
              {tradeNames[language].map((name, i) => {
                const Icon = tradeIcons[i];
                return (
                  <Choice
                    key={i}
                    selected={i === 0 && trade === "Electrician"}
                    disabled={i !== 0}
                    icon={<Icon size={30} />}
                    title={tr(name)}
                    subtitle={tr(i !== 0 ? t.soon : undefined)}
                    onClick={() => setTrade("Electrician")}
                  />
                );
              })}
            </div>
            <ErrorNotice message={tr(error)} />
            <Actions
              onBack={() => navigate("/start")}
              onNext={() => void run(() => saveProfile({ trade }, "years"))}
              disabled={!trade}
              busy={busy}
            />
          </>
        )}
        {current === "years" && (
          <>
            <StepTitle
              number="03"
              label={t.experience}
              title={t.yearsQuestion}
              help={t.yearsHelp}
            />
            <div className="years-grid">
              {t.yearsOptions.map((label, i) => (
                <Choice
                  key={label}
                  selected={year === years[i]}
                  icon={
                    <span className="year-number">
                      {tr(["<1", "1–3", "3–5", "5+"][i])}
                    </span>
                  }
                  title={tr(label)}
                  onClick={() => setYear(years[i])}
                />
              ))}
            </div>
            <ErrorNotice message={tr(error)} />
            <Actions
              onBack={() => navigate("/worker/trade")}
              onNext={() =>
                void run(() =>
                  saveProfile({ yearsExperience: year }, "describe"),
                )
              }
              disabled={year === null}
              busy={busy}
            />
          </>
        )}
        {current === "describe" && (
          <>
            <StepTitle
              number="04"
              label={t.experience}
              title={t.describeQuestion}
              help={t.describeHelp}
            />
            {!recordedVoice && <div className={`voice-box ${recording ? "recording" : ""}`}>
              <button
                className="microphone"
                onClick={speech}
                aria-label={tr(recording ? t.stop : t.speak)}
              >
                {tr(recording ? <MicOff size={29} /> : <Mic size={29} />)}
              </button>
              <strong>{tr(recording ? t.stop : t.speak)}</strong>
              <span>
                {tr(
                  recording ? (
                    <span className="recording-indicator">● ● ●</span>
                  ) : language === "en" ? (
                    "Your words. Your experience."
                  ) : (
                    t.describeHelp
                  ),
                )}
              </span>
            </div>}
            <div className="or-divider" hidden={recordedVoice}>
              <span>
                {tr(
                  language === "en"
                    ? "OR TYPE BELOW"
                    : language === "hi"
                      ? "या नीचे लिखें"
                      : "किंवा खाली लिहा",
                )}
              </span>
            </div>
            {recordedVoice ? <RecordedVoice key={language} disabled={busy} onBusy={setRecording} onText={text => { setDescription(prev => (prev + " " + text).trim().slice(0, 4000)); setVoiceUsed(true); setNotice(""); }} /> : <button className="text-button" type="button" disabled={busy} onClick={() => { recognition.current?.abort(); setRecording(false); setRecordedVoice(true); }}>{tr("Record audio instead")}</button>}
            <label className="description-label">
              {t.textLabel}
              <textarea
                rows={5}
                value={description}
                maxLength={4000}
                placeholder={t.textPlaceholder}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="character-count">
              {tr(description.length)} / 4000
            </div>
            {recording && !recordedVoice && <p role="status">{tr("Listening… Keep speaking. Use Stop when you finish.")}</p>}
            {interimSpeech && <p className="speech-interim" aria-live="polite">{interimSpeech}</p>}
            <button
              className="button secondary"
              disabled={busy || recording || description.trim().length < 15}
              onClick={() =>
                void run(async () => {
                  const input = experienceSchema.parse({
                    experienceDescription: description,
                    trade: "Electrician",
                    yearsExperience: year ?? 0,
                    declarationSource: voiceUsed ? "voice" : "text",
                  });
                  await queueDeclaration(
                    user!.id,
                    data!.profile.id,
                    input,
                    declarationBase ?? data!.profile.version,
                  );
                  setNotice(
                    tr(
                      "Experience saved on this device. Reconnect to continue with skill extraction.",
                    ),
                  );
                })
              }
            >
              {tr("Save experience on device")}
            </button>
            {notice && (
              <div className="notice">
                {tr(notice)}{" "}
                <button className="text-button" onClick={speech}>
                  {tr("Try voice again")}
                </button>
              </div>
            )}
            <ErrorNotice message={tr(error)} />
            <Actions
              onBack={() => navigate("/worker/years")}
              onNext={analyse}
              nextLabel={busy ? t.analysing : t.analyse}
              disabled={description.trim().length < 15 || recording}
              busy={busy}
            />
            <button
              className="manual-link"
              disabled={busy || description.trim().length < 15 || recording}
              onClick={manualStart}
            >
              {t.manual}
              <ArrowRight size={15} />
            </button>
          </>
        )}
        {current === "skills" && (
          <>
            <StepTitle
              number="05"
              label={t.work}
              title={tr(
                manual || !data.profile.detectedSkills.length
                  ? t.manualTitle
                  : t.skillTitle,
              )}
              help={t.skillHelp}
            />
            {tr(manual && <div className="notice">{t.manualNotice}</div>)}
            {notice && <div className="notice">{tr(notice)}</div>}
            <div className="skill-choices">
              {[
                ...new Set([
                  ...skillOptions,
                  ...data.profile.detectedSkills,
                  ...selectedSkills,
                ]),
              ].map((skill) => (
                <Choice
                  key={skill}
                  selected={selectedSkills.includes(skill)}
                  icon={<Zap size={21} />}
                  title={tr(skillLabel(skill))}
                  onClick={() => toggleSkill(skill)}
                />
              ))}
            </div>
            <div className="custom-skill">
              <label>
                {t.addSkill}
                <input
                  value={custom}
                  maxLength={80}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder={t.customSkill}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                />
              </label>
              <button
                className="button outline"
                disabled={
                  custom.trim().length < 2 || selectedSkills.length >= 20
                }
                onClick={addCustom}
              >
                <Plus size={18} />
                {t.addSkill}
              </button>
            </div>
            <small className="subtle">{t.englishSkill}</small>
            <ErrorNotice message={tr(error)} />
            <Actions
              onBack={() => navigate("/worker/describe")}
              onNext={confirmSkills}
              nextLabel={busy ? t.matching : t.confirm}
              disabled={!selectedSkills.length}
              busy={busy}
            />
          </>
        )}
        {current === "match" && (
          <>
            <StepTitle
              number="06"
              label={t.work}
              title={t.matchTitle}
              help={t.matchHelp}
            />
            {match ? (
              <div className="match-card">
                <div className="match-header">
                  <span className="pale-icon">
                    <Zap size={31} />
                  </span>
                  <div>
                    <small>{tr("ELECTRICIAN · DOMESTIC SOLUTIONS")}</small>
                    <h2>
                      {tr(
                        language === "en"
                          ? match.qualification.title
                          : tradeNames[language][0],
                      )}
                    </h2>
                  </div>
                  <div className="match-percentage">
                    {tr(match.matchScore)}
                    <span>%</span>
                    <small>
                      {tr(
                        language === "en"
                          ? "profile match"
                          : language === "hi"
                            ? "प्रोफ़ाइल मिलान"
                            : "प्रोफाइल जुळते",
                      )}
                    </small>
                  </div>
                </div>
                <div className="match-bar">
                  <span style={{ width: match.matchScore + "%" }} />
                </div>
                <h3>{t.matched}</h3>
                <div className="skill-tags">
                  {match.matchedSkills.length ? (
                    match.matchedSkills.map((s) => (
                      <span key={s}>
                        <Check size={14} />
                        {tr(skillLabel(s))}
                      </span>
                    ))
                  ) : (
                    <p className="subtle">
                      {tr(
                        language === "en"
                          ? "Your custom skills are saved. They do not overlap with this demo qualification."
                          : t.englishSkill,
                      )}
                    </p>
                  )}
                </div>
                {!!match.partialMatches?.length && (
                  <>
                    <h3>{tr("Partial matches")}</h3>
                    <div className="skill-tags gaps">
                      {match.partialMatches.map((p) => (
                        <span key={p.skill}>
                          {tr(p.skill)} · {p.source}
                        </span>
                      ))}
                    </div>
                    <p>
                      {tr(
                        "Related wording counts as half a skill match; it is not proof of competence.",
                      )}
                    </p>
                  </>
                )}
                {match.gaps.length > 0 && (
                  <>
                    <h3>{t.gaps}</h3>
                    <div className="skill-tags gaps">
                      {match.gaps.map((s) => (
                        <span key={s}>{tr(skillLabel(s))}</span>
                      ))}
                    </div>
                  </>
                )}
                <details>
                  <summary>
                    {t.details}
                    <ChevronDown size={16} />
                  </summary>
                  <dl>
                    <div>
                      <dt>{tr("Qualification code")}</dt>
                      <dd>{tr(match.qualification.code)}</dd>
                    </div>
                    <div>
                      <dt>{tr("NSQF level (demo)")}</dt>
                      <dd>{tr(match.qualification.nsqfLevel)}</dd>
                    </div>
                    <div>
                      <dt>{tr("Sector")}</dt>
                      <dd>{tr(match.qualification.sector)}</dd>
                    </div>
                  </dl>
                  <p className="subtle">{tr(match.explanation)}</p>
                </details>
                <div className="demo-disclosure">{t.demo}</div>
              </div>
            ) : (
              <Loading />
            )}
            <ErrorNotice message={tr(error)} />
            <Actions
              onBack={() => navigate("/worker/skills")}
              onNext={() => navigate("/worker/quiz")}
              nextLabel={t.startQuiz}
              disabled={!match}
            />
          </>
        )}
        {current === "quiz" && (
          <>
            {questions.length > 0 && quizRestored ? (
              (() => {
                const q = questions[questionIndex],
                  localized =
                    language !== "en"
                      ? localQuestions[language][questionIndex]
                      : null;
                return (
                  <>
                    <div className="quiz-meta">
                      <span>
                        {t.question} {tr(questionIndex + 1)} /{" "}
                        {tr(questions.length)}
                      </span>
                      <span>
                        {
                          questions.filter((q) => answers[q.id] !== undefined)
                            .length
                        }{" "}
                        / {tr(questions.length)}
                      </span>
                    </div>
                    <div className="quiz-progress">
                      <span
                        style={{
                          width:
                            ((questionIndex + 1) / questions.length) * 100 +
                            "%",
                        }}
                      />
                    </div>
                    <StepTitle
                      number="07"
                      label={t.assessment}
                      title={tr(
                        review ? t.review : (localized?.q ?? q.question),
                      )}
                      help={t.quizHelp}
                      readText={tr(
                        review
                          ? t.review
                          : [
                              localized?.q ?? q.question,
                              ...(localized?.o ?? q.options),
                            ].join(". "),
                      )}
                    />
                    {review ? (
                      <div className="answers-review">
                        {questions.map((question, i) => (
                          <div key={question.id}>
                            <span>{tr(i + 1)}</span>
                            <div>
                              <strong>
                                {tr(
                                  language === "en"
                                    ? question.question
                                    : localQuestions[language][i].q,
                                )}
                              </strong>
                              <p>
                                {tr(
                                  language === "en"
                                    ? question.options[answers[question.id]]
                                    : localQuestions[language][i].o[
                                        answers[question.id]
                                      ],
                                )}
                              </p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => {
                                setReview(false);
                                setQuestionIndex(i);
                              }}
                              aria-label={tr(`${t.back} ${i + 1}`)}
                            >
                              <ArrowLeft size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="answer-options">
                        {q.options.map((option, i) => (
                          <Choice
                            key={`${q.id}-${i}`}
                            selected={answers[q.id] === i}
                            title={tr(localized?.o[i] ?? option)}
                            icon={
                              <span className="answer-letter">
                                {tr("ABCD"[i])}
                              </span>
                            }
                            onClick={() =>
                              setAnswers((a) => ({ ...a, [q.id]: i }))
                            }
                          />
                        ))}
                      </div>
                    )}
                    <ErrorNotice message={tr(error)} />
                    <Actions
                      onBack={() => {
                        if (review) setReview(false);
                        else if (questionIndex > 0)
                          setQuestionIndex((i) => i - 1);
                        else navigate("/worker/match");
                      }}
                      onNext={() => {
                        if (review) submit();
                        else if (questionIndex < questions.length - 1)
                          setQuestionIndex((i) => i + 1);
                        else setReview(true);
                      }}
                      nextLabel={
                        review
                          ? busy
                            ? t.submitting
                            : t.submit
                          : questionIndex === questions.length - 1
                            ? t.review
                            : t.continue
                      }
                      disabled={
                        quizConflict ||
                        queuedSelf ||
                        (!review && answers[q.id] === undefined)
                      }
                      busy={busy}
                    />
                  </>
                );
              })()
            ) : (
              <>
                <Loading />
                <ErrorNotice message={tr(error)} />
                {tr(
                  error && (
                    <button className="button" onClick={() => void load()}>
                      {t.retry}
                    </button>
                  ),
                )}
              </>
            )}
          </>
        )}
        {current === "result" && data.assessment && (
          <div className="result-view">
            <span className="success-symbol">
              <CheckCircle2 size={38} />
            </span>
            <div className="section-label centered">
              {tr("JOURNEY MILESTONE")}
            </div>
            <h1>{t.complete}</h1>
            <p>{t.resultHelp}</p>
            <div className="result-score">
              <span>
                {tr(data.assessment.selfAssessmentScore)}
                <small>%</small>
              </span>
              <p>{t.score}</p>
            </div>
            <div className="result-details">
              <div>
                <span>{data.user.name}</span>
                <strong>{tr(tradeNames[language][0])}</strong>
              </div>
              <div>
                <span>{t.saved}</span>
                <strong>
                  {tr(
                    new Intl.DateTimeFormat(
                      language === "en"
                        ? "en-IN"
                        : language === "hi"
                          ? "hi-IN"
                          : "mr-IN",
                      { dateStyle: "medium" },
                    ).format(new Date(data.assessment.createdAt)),
                  )}
                </strong>
              </div>
            </div>
            <WorkerOutcome
              assessment={data.assessment}
              onRefresh={() => void load()}
            />
            <p className="result-disclosure">
              <ShieldCheck size={16} />
              {t.notCertificate}
            </p>
            <Link className="button" to="/">
              {t.returnHome}
              <ArrowRight size={18} />
            </Link>
          </div>
        )}
        {current !== "result" && (
          <div className="worker-footnote">
            <ShieldCheck size={15} />
            {tr(busy ? t.saving : dirty ? t.continueToSave : t.saved)} ·{" "}
            {data.user.name}
          </div>
        )}
      </main>
    </>
  );
}
