# DakshSetu — updated SIH PS 26242 technical audit

**Current operational-portal follow-up:** [PORTAL-COMPLETION.md](PORTAL-COMPLETION.md). The former read-only admin gap is now addressed; historical test counts and bundle sizes below describe the earlier checkpoint.

17 October 2026. Follow-up verification: **54 tests passed**, real FFmpeg/live video tested, route bundle warning resolved; see [REMAINING-TASKS.md](REMAINING-TASKS.md). This updates, rather than overwrites, [the pre-change baseline](AUDIT-BASELINE.md). Scope: existing local source, connected React/Express/MongoDB tests, production compilation/smoke checks, generated offline handlers, rendered synthetic PDF and live Gemini/Cloudinary synthetic evidence. Public deployment and real browser/hardware observations are not assumed. Hosting is deliberately left to the user.

## Findings by capability

Classification: **A** implemented and verified within the described scope; **B** partial or unverified at a material boundary; **C** UI-only/mocked; **D** missing; **E** broken. A controlled provider test does not mean the actual production integration is mocked.

| Capability | Class | Observed implementation and limits |
|---|---|---|
| Authentication / roles | A | JWT, bcrypt, worker-only registration, assessor/admin guards, private worker data, tab refresh, production demo-login denial. Account recovery and institutional assessor identity checks remain future work. |
| Structured declaration / resume | A | Trade, years, multilingual editable description, detected/confirmed skills, profile progression and stored match explanation. |
| Voice / read-aloud | B | Actual browser API, correct three locale codes, transcript source/audit and typing fallback; controlled recognition contracts pass. Physical audio, permissions and read-aloud quality unverified. |
| AI skill extraction | A | Real server-only Gemini integration plus manual fallback; live synthetic extraction returned four relevant skills. Not a claim of validated worker competence. |
| QP / NSQF mapping | B | Computed 60/20/20 explanation, conservative partial credit and gaps, persisted full match. Only an explicitly demo electrician qualification is used. Older PSSC v1.0 / Level3 source provenance is exposed separately; current approval and a validated official QP corpus are not established. |
| Self-assessment | A | Five questions, hidden answer keys, backend score calculation, validation, resume, offline submit and competency breakdown. It is a short prototype instrument. |
| Practical rubric | A | Versioned twelve criteria for new records, eight for legacy; anchors 0–3, weights total 100, remarks, evidence references and mandatory-safety warnings. No silent legacy rescoring. |
| Private image / AI observation | A | Real private Cloudinary upload, normalized image bytes and metadata, authenticated preview, Gemini evidence descriptions/confidence/uncertainty and history. Live synthetic image produced twelve criterion observations. A still image cannot verify a full procedure. |
| Private video / frame AI | A | Actual MP4/WebM and sparse-frame decoding, corrupt/overlong rejection and missing-runtime fallback pass. Live private Cloudinary video → six actual frames → twelve Gemini observations → persistent analysis/audit passes with synthetic evidence. Real-work accuracy and deployment runtime still require validation. |
| Human decision / override | A | Exclusive assigned assessor, saved rubric and evidence, approved score/recommendation, meaningful explanation and explicit confirmation; original AI suggestion preserved; signed-off writes denied. |
| Score calculation | A | Default/legacy backend `round(self*0.30 + approvedPractical*0.70)`; 100 and 90 yield 93. Administrators can version weights and recommendation thresholds for new assessments; the actual policy is snapshotted. Four recommendation choices are human confirmed and prototype labelled. |
| Competency Passport / PDF / QR | A | Stable original snapshot, native Unicode PDF, QR, minimal public record, private download, share/copy fallback and versioned checksum. Synthetic two-page PDF rendered and inspected. Printed records are snapshots; web verification is current. Native phone share/QR hardware remains manual. |
| Revocation / integrity | A | Permanent admin-only revocation, checksum mismatch fails closed, unrelated workers denied, original score/assessment remains locked. SHA-256 is tamper-evident, not a private-key signature or official certificate. |
| Micro-reassessment | A | Below-threshold competency only, worker request, assigned assessor, genuinely new evidence, version checks, confirmed human score, immutable attempts, appended history/current competency and credential revision. No replacement of original outcome. |
| Offline data / later sync | B | Actual IndexedDB declaration/quiz/rubric/media queue, remount/reconnect, stable retries, conflict and quota handling tested against real API. Static service-worker handlers tested. Installed browser lifecycle, eviction behaviour and camera capture remain manual. |
| Consistency module | A | Finished no-data state, protected CSV persistence/import, explicit client-only synthetic demo, computed Cohen/Fleiss Kappa, complete paired panels/exclusions, undefined degenerate values and descriptive group deviations. No real ratings are supplied. |
| Calibration | A | Administrator-entered scenario/reference, independent assessor entry, hidden reference until scoring, persistent score and deviation. Neither an official benchmark nor an effect on worker credentials. |
| Real reduction of assessor variance | D | No controlled human before/after data. Synthetic agreement values cannot establish real variance reduction. |
| Multilingual / low-literacy UX | B | Localized catalogs and route/control tests, worker cards and single-question flow, large actions, compact provided logo, fluid grids/table scrolling. No actual user study, viewport/zoom/browser visual QA or assistive-technology audit. |
| Deployment | B | Compiled single-service serving, deep links, health readiness, secret exclusion, manual templates/guide. No public deployment created; Docker engine unavailable. |

Worker UX score: **7.5/10, provisional source/control review**, not a usability study. The main worker journey remains simple; advanced controls sit in assessor/admin or Passport panels. Static labels are translated; user-authored names/scenarios and CSV machine headers remain as entered. Native PDF labels are English with Unicode names; localized browser printing remains available.

## Security, data lifecycle and audit

- Registration, JWT role isolation, private Passport/media authorization, finalization locks, administrator revocation and quality-route protection are tested. Public credential IDs have 128 random bits. Verification is rate-limited and returns no private evidence or contact data.
- Provider/JWT secrets remain server-side; `.env` is ignored. Production refuses weak/missing JWT configuration and denies known demo users by default. No trusted credential URL is built from request Host headers.
- Images are decoded, MIME matched, metadata stripped and bounded. Videos have byte/header/type/size bounds; without a decoder, container/header validation is not proof that a file is playable. New reassessment evidence is private and linked to its attempt, not appended to the locked original assessment.
- Offline account caches intentionally store previously opened data on the device; these are not encrypted backups. Private API/media are excluded from service-worker caching. Sync keeps unacknowledged media and rejects stale score writes instead of silently overwriting.
- Durable audit includes voice source, extraction, confirmation, mapping, self-assessment, practical saves, evidence uploads, image/video analysis, overrides/reasons, human sign-off, Passport creation, credential views/revocation/update, reassessment and dataset import. Original audit event names remain alongside compatibility aliases. No historical events are invented for legacy records.
- Operational gaps remain: password recovery, verified institutional onboarding, retention/cleanup policies, backups/restore drills, distributed rate limiting, large-scale storage and monitoring. Dependency audit reports zero known vulnerabilities at verification time; that is not a security certification.

## Strict completion scores

| Dimension | Score | Reason |
|---|---:|---|
| Problem Statement Coverage | 88/100 | End-to-end electrician support and integrity exist; official qualification mapping and empirical consistency evidence remain incomplete. |
| Functional Prototype Completion | 93/100 | Connected persistence, permission, offline, credential, PDF, reassessment and quality flows; synthetic video frame processing is now verified; physical browser/hardware and real-work accuracy remain unverified. |
| SIH Demo Readiness | 84/100 | Usable local demonstration with explicit synthetic mode and provider fallbacks; intended presentation laptop/phone/network/voice checks remain necessary. |
| Production Readiness | 57/100 | Build/serving/manual deployment supported; no public deployment, identity operations, recovery, monitoring, retention or scale validation. |

These are engineering judgments, not benchmark or certification scores. An attractive demo screen does not earn credit for real experimental findings.

## Priority actions

**P0 — before presenting a fully verified SIH demonstration**

1. On the intended presentation laptop, run the handoff’s real browser/microphone/zoom/offline-install/QR/PDF/share checklist. Browser access was denied to automation, so these checks cannot honestly be marked passed here. Fix any failures found there.
2. Keep the QP explicitly labelled demo/unverified and the consistency page in no-data or synthetic mode. Do not claim official recognition or measured reduction in bias. To claim improvement, collect and import matched independent human ratings in both conditions and document the study design.
3. If presenting on a different machine/host, install both native video tools there and validate the intended real practical clip. Local FFmpeg/FFprobe and live synthetic video verification are complete.

**P1 — should fix if time remains**

- Obtain and verify the official electrician QP/NOS/NSQF source and assessment blueprint; version it with provenance.
- Complete the user’s manual HTTPS deployment and rerun provider, CORS, refresh, install/offline and QR-origin checks there.
- Validate real assessor calibration references and run a paired study with enough cases; report sample size, exclusions, uncertainty and limits.
- Route splitting is complete: entry392 kB, total initial static graph656 kB and all chunks below500 kB. Measure actual browser performance on the intended host/network and test accessibility/screen readers.

**P2 — production / future scope**

- Account recovery/MFA, institution-controlled role onboarding, consent and retention controls, audit archival, database backups and restore drills.
- Stream media through a dedicated private object-storage retrieval layer, shared rate limits, queue/worker monitoring, signed credentials and real issuing-authority integration.
- More trades, richer validated question banks, larger video review evaluation and formal accessibility/usability studies.

## Requirements coverage

| PS Requirement | Implementation Found | Status | Evidence / File / Route | Fix Needed |
|---|---|---|---|---|
| Structured self-declaration | Stored trade, experience, text/voice source, confirmed skills | PASS | `Worker.tsx`, `/api/workers/experience`, Profile | Validate real microphone UX |
| NSQF/QP mapping | Computed explainable match and partial matches to demo QP | PARTIAL | `shared/data.ts`, `/api/qualifications/match`, Profile.matchDetails | Verified official qualification data |
| Practical skill checklist | Versioned persisted criteria, anchors and evidence references | PASS | `shared/assessment.ts`, `/api/assessments/:id/practical` | Validate trade instrument with experts |
| Image/video assessment aid | Live private image/video/Gemini, actual bounded decoder, six frames and manual fallback | PASS | `evidence.ts`, `media.ts`, `video.ts`, real decoder tests and live-video script | Validate real-work accuracy and target-host runtime |
| Standardized scoring rubric | Twelve weighted criteria; legacy eight preserved | PASS | `getRubric`, Assessor page, stored rubricVersion | No blocking code fix identified |
| Assessor variance reduction | Common rubric, calibration, paired comparison tooling | PARTIAL | `/assessor/calibration`, `/admin/quality`, `shared/consistency.ts` | Actual matched human study |
| Competency profile | Stable original snapshot plus current reassessment history | PASS | SkillPassport, Credential, `/passports/:id` | No blocking code fix identified |
| Certification recommendation | Backend weighted score and human-confirmed prototype recommendation | PASS | `assessor.ts` finalize, `calculateFinal` | Official issuing-authority integration for real certification |
| Human assessor sign-off | Assigned human, confirmation, evidence, reasons, permanent lock | PASS | `/api/assessments/:id/finalize` | No blocking code fix identified |
| AI does not replace assessor | Suggestions/history distinct from approved score; manual fallback | PASS | AIAnalysis, Assessment.aiSuggestedScore, finalize guard | Retain this constraint |
| Offline data capture | Account-scoped quiz/rubric/media bytes and drafts | PARTIAL | `client/src/services/offline.ts`, Dexie tests | Real installed-PWA/device validation |
| Later sync | Metadata-first media, stable IDs, acknowledgements and explicit conflicts | PASS | offline queue, `/api/sync/batch`, media-intents | Test intended network/device conditions |
| One complete trade | Electrician declaration through human recommendation and Passport | PASS | Connected React/API flow; live synthetic provider test | Demo qualification is not official certification |
| Assessor scoring interface | Candidate claim, rubric, private evidence, AI, override, sign-off | PASS | `/assessor`, `/assessor/candidates/:id` | Real viewport/accessibility check |
| Consistency improvement evidence | No real paired ratings; honest no-data state and labelled synthetic demo | FAIL | `/admin/quality`, `syntheticRatings()` | Collect real matched unassisted/assisted ratings; do not relabel demo |
| Certification integrity | Private snapshot, random public ID, checksum, revocation, appended history | PASS | `credentials.ts`, `reassessment.ts`, `/verify/:credentialId` | Operational identity/issuer validation for production |

NOT READY

This strict verdict concerns a claim of fully validated PS compliance, not whether the local prototype can be demonstrated.
The implemented worker-to-assessor-to-Passport flow is usable and tested, with honest no-data/demo consistency screens.
Real assessor-consistency improvement, official QP provenance, physical browser/audio checks and a deployed environment are still unverified.
Complete the presentation-device checks and retain those disclosures; collect real ratings before claiming empirical improvement.
