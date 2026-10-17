# DakshSetu: baseline audit against SIH PS 26242

17 October 2026. This is the inspection **before** implementing the advanced-feature request. Evidence: current source, 32 passing real-MongoDB API tests, nine passing React/Dexie/localization tests, production compilation, generated service-worker handler tests and a compiled production-server smoke test. Provider responses in ordinary tests are controlled doubles; earlier live provider results are historical, not a new live test. Browser visual/audio QA and a deployed public service were unavailable. No credit is awarded for those unobserved behaviours.

## Existing system and evidence

React 19 / Vite 6 / TypeScript / React Router / Axios / React Hook Form and Zod; Express / Mongoose / MongoDB; bcrypt and signed JWT sessions; Gemini backend skill/image calls; private Cloudinary images; Dexie IndexedDB and generated service worker. Worker and assessor workflows use real database records. Current Passport is private, printable and downloadable as JSON. Administration is read-only. Hosting is intentionally manual at the user's request.

Classification: **A** fully working in the tested scope; **B** partial or has unverified boundaries; **C** UI-only/mocked implementation; **D** missing; **E** broken. Controlled test providers do not make the actual provider implementation a mock.

| Feature | Class | Finding / evidence |
| --- | --- | --- |
| Registration, login and refresh | A | `server/src/app.ts`, `client/src/store/session.tsx`; real JWT, bcrypt, DB users, refresh tested. Tab closure ends the session token. |
| Worker self-declaration | A | `Worker.tsx`, profile/experience routes; trade, years and description persist and incomplete journeys resume. |
| Voice and read-aloud | B | Real SpeechRecognition/webkitSpeechRecognition handlers append final transcripts; en-IN/hi-IN/mr-IN; textarea fallback. Actual microphone, permissions and audible speech were not exercised. No separate tool inventory capture. |
| Skill extraction | A | `services.ts` calls Gemini server-side, validates structured output, allows manual selection/editing and saves confirmed skills. Safety is not inferred simply from the occupation. Live success documented earlier; current tests exercise success/failure transports. |
| Qualification mapping | B | `shared/data.ts`: deterministic overlap60/task20/experience20, genuine computed score and gaps. Only one seeded, explicitly demo QP; no verified official qualification pack and no partial-match object/persisted full explanation yet. |
| Self-assessment | A | Five relevant electrical questions; safe question API excludes keys; answers and category scores stored server-side; duplicate/invalid/forged scores rejected. 0/80/100% boundaries tested. |
| Assessor interface | A | DB-backed candidates, statuses, experience, skills, qualification and self score; exclusive assessor claim. |
| Practical scoring | A | Eight fixed criteria, scale0–3 and weights summing100; rubric saves, remarks, resume and lock tested. Expanded 12-criterion rubric, evidence-per-criterion and mandatory-safety warning are not present yet. |
| Image evidence | A | Authenticated Cloudinary upload and Mongo metadata/normalized bytes; preview; MIME/content/size validation; six-image cap; failure/compensation paths. Earlier real upload tested; current provider transport controlled. |
| AI image observation | A | Multimodal Gemini receives actual image bytes and criterion IDs; structured confidence/warnings/limitations; Suggested Only; failure permits manual continuation. No automatic certification. |
| Video evidence / sequence review | D | No video upload or frame extraction. No FFmpeg/FFprobe command found on PATH. |
| Human final decision | A | Assigned assessor must submit all saved criteria, evidence, final score, recommendation and explicit confirmation. Meaningful adjustment requires explanation; signed-off changes are locked. |
| Override/history | A | Raw AI suggestion, human score, reason, actor and timestamps retained. Audit records score changes and significant AI overrides. Event naming is the original vocabulary, not the new requested complete event set. |
| Final scoring | A | `round(self*.30+approvedPractical*.70)` on backend; test flow100+90=93. Example80+90=87 by same function. Recommendation thresholds are explicitly prototype rules, with four human-selectable outcomes. |
| Skill Passport | A | Actual DB snapshot, self/rubric breakdown, strengths/gaps, recommendation, assessor/date, verified status and non-government notice. Private authorized retrieval, browser Print/Save PDF action and JSON export work. Native PDF layout not visually tested. |
| Public QR / credential revocation / direct PDF / sharing | D | No public verification route, credential status/hash/QR, dedicated PDF generation or share action yet. |
| Basic offline data and sync | A | Real Dexie caches/drafts/queue; controlled offline events plus React remount restore quiz and all eight practical selections, then actual Express/MongoDB sync. Retry IDs, version conflict, account isolation, quota, bounded retries and in-flight newer drafts tested. |
| Offline boundaries | B | Production shell handler tested in Node, not an actual service-worker/browser lifecycle. Previously opened data only; no offline onboarding writes or queued media. Upload/AI/sign-off/new login require connectivity. Basic shell, not fully validated installable PWA. |
| Admin pages | A | Actual statistics, qualifications, users, assessments, paginated audits; roles checked and credential/evidence internals excluded. |
| Reassessment / credential history | D | Original signed-off record correctly locked; no micro-reassessment model/flow. |
| Consistency / calibration | B | Standard rubric reduces opportunities for variation by design, but no comparison dataset, calibration, Kappa or real improvement experiment. No measured improvement can be claimed. |
| Deployment | B | Ready-to-run single-service Node build, Render/Docker templates and manual guide. Compiled server smoke passes. No public hosting; Docker engine unavailable. |

## Authentication and security pass/fail

| Check | Result |
| --- | --- |
| Worker register/login; assessor login; admin login | PASS, exercised against real MongoDB |
| JWT authorization and password hashes | PASS |
| Worker blocked from assessor APIs | PASS |
| Assessor blocked from admin APIs | PASS |
| Refresh restores authenticated user | PASS within the same tab/session |
| No Gemini/Cloudinary/JWT secrets or answer keys in client bundle | PASS, production bundle checked |
| Production JWT env secret | PASS; required and at least32 characters |
| CORS exact origins and protected routes | PASS, configured; public deployed origin not tested |
| Input and image content/MIME/size validation | PASS |
| `.env` excluded | PASS, `.gitignore` and `.dockerignore`; this workspace has no initialized Git repository |
| Known demo logins disabled in production | PASS |
| Public credential minimal-data safety / revocation | FAIL: feature not implemented at baseline |

## Worker UX and lifecycle

**Provisional UX score: 7/10.** Source and control-driven tests show one main question per step, large visual choices, clear Back/Next/progress, selectable languages and manual fallback. Some explanatory/qualification text is dense. Responsiveness uses existing compact logo, fluid grids and mobile breakpoints; actual browser/zoom/mobile/voice usability was not verified this phase. This score is a heuristic review, not a user study.

Stored lifecycle is `REGISTERED → DECLARED → MAPPED → SELF_ASSESSED → IN_ASSESSMENT → SIGNED_OFF`. Practical pending is represented by SELF_ASSESSED; assessed work stays IN_ASSESSMENT until final sign-off. The requested PRACTICAL_PENDING/ASSESSED literal statuses do not exist. Ownership, prerequisites, version checks and lock prevent illegal writes; different label names are not themselves a missing human-review step.

## Persistence and reliability

Mongo stores users, worker profiles, qualifications, self responses/category scores, practical scores/remarks, evidence metadata/normalized image bytes, AI observations, final decision, Passport snapshots and audit logs. Quiz/rubric drafts also persist in IndexedDB. Other unsent form text and selected not-yet-uploaded media remain page memory. Full qualification explanation/match details are regenerated; only selected ID/percentage are stored at baseline.

Development seeds a worker, assessor, admin and prototype qualification; manual skills and manual AI-evidence review paths exist. There is no claimed DEMO_MODE or destructive reset command. Cloudinary failure is visible and retryable; new sign-off still requires successfully stored evidence. Refresh recovery was tested. Earlier records do not get fabricated audit history.

No public frontend/backend URL was supplied and no deployment was authorized in this pass. Thus deployed CORS, production secret setup, live provider behaviour on hosting, public refresh/console/upload tests are **not verified**. Local compiled deep links/health/assets did pass. Localhost defaults and test URLs remain intentionally in development code; public QR URLs will need an explicit trusted origin.

## Consistency requirement

**PARTIAL.** Standardized criteria and tests exist; no real same-case multi-assessor scores or before/after experiment exist. Kappa and improvement must not be invented. Fastest valid experiment: recruit three assessors; use5–10 identical anonymized cases and the same ordinal categories; collect independent unassisted scores, then rubric-assisted scores with order/case effects controlled; retain raw scores; calculate Fleiss' Kappa for each condition and report sample size, uncertainty and limitations. Use Cohen's Kappa for exactly two assessors. Distinguish unweighted categorical agreement from numeric-score deviation. Correlation alone is not agreement.

## Exact requirements coverage table

| PS Requirement | Implementation Found | Status | Evidence / File / Route | Fix Needed |
|---|---|---|---|---|
| Structured self-declaration | Trade, years, narrative, persisted profile | PASS | Worker.tsx; POST /api/workers/experience | Verify real microphone and low-literacy usability |
| NSQF/QP mapping | Explainable calculated match to labelled demo QP | PARTIAL | shared/data.ts; POST /api/qualifications/match | Verify official QP/NOS data before claiming official alignment; persist complete explanation |
| Practical skill checklist | Guided electrical task and saved scores | PASS | shared/assessment.ts; PUT /api/assessments/:id/practical | Expand safety/procedure details without changing old signed records |
| Image/video assessment aid | Real private images and multimodal observations | PASS | evidence.ts; POST /api/ai/analyze-evidence | Video optional at baseline; implement requested safe review path |
| Standardized scoring rubric | Same0–3 anchors and weights | PASS | shared/assessment.ts | Version expanded rubrics |
| Assessor variance reduction | Consistency mechanisms, no measured effect | PARTIAL | Existing rubric and override history | Run independent same-case comparison |
| Competency profile | Actual self categories/practical breakdown | PARTIAL | GET /api/passports/:id | Official NSQF/NOS validation remains absent |
| Certification recommendation | Four human-controlled prototype outcomes | PASS | POST /api/assessments/:id/finalize | Retain prototype notice |
| Human assessor sign-off | Required assigned human, evidence and confirmation | PASS | assessor.ts finalization | Preserve locks |
| AI does not replace assessor | Suggestions only, manual fallback | PASS | evidence.ts; assessor.ts | Preserve all new flows |
| Offline data capture | Dexie quiz and practical scores/remarks | PASS | services/offline.ts | Add queued media; verify browser shell lifecycle |
| Later sync | Reconnect, idempotency, CAS, visible conflicts/retries | PASS | POST /api/sync | Extend without bypassing version checks |
| One complete trade | Electrician worker-to-assessor-to-Passport | PASS | client/test/workflow.test.tsx | Manual device and deployed walkthrough |
| Assessor scoring interface | Actual candidate/claim/rubric/evidence/recommendation | PASS | pages/Assessor.tsx | Calibration/reassessment additions |
| Consistency improvement evidence | No real experiment result | FAIL | No calibration/experiment records | Collect actual ratings; compute defensible agreement metrics |
| Certification integrity | Human lock and honest prototype designation | PASS | JWT/roles/CAS; Passport disclaimer | Add revocable public credentials without exposing private evidence |

## Scores and priorities

These are strict reviewer estimates, not statistically measured percentages: **PS coverage75/100; functional prototype88/100; SIH demo readiness72/100; production readiness45/100.** The full electrician prototype works in controlled end-to-end tests; missing real consistency evidence, unverified official mapping, browser/device verification and public deployment materially lower readiness.

**P0 — before the SIH claim/demo:** collect real independent before/after assessor ratings and report calculated agreement; verify real voice/audio and browser offline refresh on target devices; run the public-host environment/CORS/evidence/Gemini/deep-link checklist after the user's manual deployment; keep all QP and certification claims explicitly prototype unless verified.

**P1:** versioned richer rubric and critical safety warning; persist match explanations/partial matches; safe video evidence/manual fallback; public revocable minimal-data credentials, actual downloadable PDF and sharing; targeted reassessment with preserved originals; quality/calibration entry and metrics.

**P2:** broader official qualification/trade coverage, privacy/retention policy and accessibility user studies, robust production monitoring/backups, larger controlled consistency studies with confidence intervals and independently assessed safety validity.

**NOT READY**

The tested electrician workflow is functional and human-controlled, including real persistence and reconnect sync.
The required evidence of actual consistency improvement is absent; a standardized rubric alone does not establish it.
Official QP/NOS alignment remains deliberately demo data, and real device/audio/public-host behaviour is unverified.
The next implementation can supply experiment tooling, but only real assessor observations can establish improvement.
