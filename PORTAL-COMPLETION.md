# DakshSetu — portal completion and re-verification

Follow-up: [portal UI simplification, logo correction and verification](UI-REFINEMENT.md).

17 October 2026. This is the current handoff for the latest request and both attached build/audit prompts. It supersedes the earlier claim that a read-only administrator area fulfilled operational administration. The existing React/Express/MongoDB architecture and saved assessments were preserved. Hosting remains the user's manual task.

## What the recheck found

The original worker/assessor assessment, evidence, AI, Passport, offline quiz/rubric/media, reassessment and quality modules had connected implementations. The screenshot correctly showed a different gap: administration mostly listed records and did not offer the requested management operations. Dedicated worker account/profile/status/evidence navigation and offline experience-declaration recovery were also missing.

Those gaps now have API routes, database persistence, visible controls, validation, errors and tests. A page or button alone was not counted as completion.

## Role-by-role result

| Area                       | Implemented behavior                                                                                                                                                                 | Important boundary                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed-in header           | Compact provided logo, language selector and labelled sign-out; public Home/How it works/About/Help navigation removed from signed-in header                                         | Portal Help lives in role navigation. Public visitors retain public navigation.                                                                                                                                                                         |
| Worker navigation          | Dashboard, My profile, My assessment, My skills, Skill Passport, Reassessment, Evidence and Help                                                                                     | The existing simple assessment screens remain intact. New workers still enter their declaration flow after registration.                                                                                                                                |
| Worker profile             | Own name/mobile/state/district edit, saved to MongoDB                                                                                                                                | It does not rewrite an issued Passport's frozen identity. District analytics use the current profile location.                                                                                                                                          |
| Worker dashboard           | Real trade, experience, self/practical status, assessor name, schedule, batch, next action and Passport availability                                                                 | No illustrative counts or invented booking dates.                                                                                                                                                                                                       |
| Worker evidence            | Image/video selection, local preview, private authenticated saved preview, offline queue and retry                                                                                   | A worker can supply evidence but cannot score, run assessor AI review or sign off. Six total evidence items; existing byte limits retained.                                                                                                             |
| Worker declaration offline | Automatic local draft, explicit save/queue, remount recovery, reconnect upload, stable receipt and version conflict                                                                  | AI and qualification confirmation still need a connection. The required cached route/profile must have been opened first.                                                                                                                               |
| User management            | Search/filter roles, create worker/assessor/admin, activate/deactivate, change role with reason and version check                                                                    | Minimum 12-character admin-created passwords. Own administrator access cannot be changed in the same account. Open assessor work must be reassigned first. Worker assessments retain worker identity/role. No hard deletion of audit subjects.          |
| Access enforcement         | Account status and current role are loaded from DB on every protected request                                                                                                        | Deactivation immediately denies existing online tokens; a disconnected device cannot learn a remote account change until reconnecting.                                                                                                                  |
| Assessor management        | Real pending/in-progress/completed workload, completed-score average, saved calibration comparisons and a review flag for deviations >=10 percentage points                          | Descriptive data, not a claim that different candidate case mixes establish assessor bias.                                                                                                                                                              |
| Assignment and schedule    | Assign/reassign an open assessment to an active assessor; batch, schedule, reason, actor, timestamp and optimistic version                                                           | Existing scores/evidence remain. Old device versions conflict. Signed-off assessments cannot be reassigned. Starting an admin-assigned case now correctly enters IN_ASSESSMENT.                                                                         |
| Batch management           | Named batches attached to assessments, real status totals, batch drill-down/filter                                                                                                   | A batch is a grouping of actual assessments, not a separate empty booking object. Assign or change batch while assigning an open assessment.                                                                                                            |
| Assessment monitoring      | Pending/in-progress/signed-off filter, worker/assessor names, batch, schedule, scores and private detail inspection                                                                  | Assessment states are the existing SELF_ASSESSED, IN_ASSESSMENT and SIGNED_OFF. No fictitious lifecycle transitions added.                                                                                                                              |
| Qualification packs        | Add/update active/inactive prototype packs, title/code/NSQF/sector/skills/tasks/NOS/source link and revision                                                                         | Pilot remains Electrician. Administrator entries remain explicitly demo data; entering a source URL is not independent official approval.                                                                                                               |
| Rubrics                    | Edit performance-criterion descriptions and weights, preserve fixed 0–3 anchors and required safety rules, create immutable versions                                                 | Twelve stable pilot criterion IDs/categories; weights total 100. New assessments copy the latest version. Historical eight-criterion records remain supported.                                                                                          |
| Scoring settings           | Supported interface languages, demo login setting, active pilot QP, self/practical weights and recommendation thresholds                                                             | Only new assessments copy changed rules. Existing active/completed assessments retain their policy/rubric/QP snapshot. Production environment can still prohibit demo accounts.                                                                         |
| AI/human integrity         | Original AI observation retained; assessor can accept, correct or reject with a separate saved note/identity/time                                                                    | Only assigned assessor. Completed review locked. Any differing AI/human score now requires an override explanation; the former 20-point tolerance remains descriptive in quality analytics only.                                                        |
| Practical voice remarks    | Browser recognition in en-IN, hi-IN or mr-IN appends an editable bounded remark                                                                                                      | Contract tested; physical microphone and permission behavior remains a device check. Typing is always available.                                                                                                                                        |
| Audit inspection           | AI outputs/confidence/limitations, human score, score difference, override reason, event timestamps and sign-off                                                                     | Admin oversight cannot change final competence scores or bypass human sign-off.                                                                                                                                                                         |
| Calibration management     | Create reference cases, assign to chosen assessors, inspect saved score/reference/deviation and assessor performance                                                                 | Reference hidden before the assessor submits. Empty assignment means open practice. References are administrator-entered practice benchmarks, not official standards.                                                                                   |
| Consistency                | Existing protected CSV import, honest no-data state, explicit synthetic demo, calculated Cohen/Fleiss Kappa and descriptive panel deviations preserved                               | No real multi-assessor comparison data was supplied. Synthetic figures remain demonstration only, per the user's earlier instruction.                                                                                                                   |
| Passport management        | List credential/worker/status/revision, private Passport link, public verifier, verification history and reasoned revocation                                                         | ACTIVE/UPDATED are issuance/reassessment states. Revocation is permanent; no unsafe arbitrary reactivation control. Original results remain locked.                                                                                                     |
| Offline/sync monitoring    | Last device pending/failed/conflict/draft counts, report time, pending media metadata and a remote retry request                                                                     | Reports appear after reconnecting. Server cannot inspect unsent browser content or transmit a disconnected device's bytes. Retry is executed by the owner's active online device; conflicts still require owner review.                                 |
| Analytics/reports          | Real worker/assessor/assessment counts, pending/progress/completed, competent rate, AI override rate, trade/district counts, knowledge-skill gap counts, quality link and CSV export | Rates include signed-off records only; competent rate means recommendation exactly Competent. Gaps are the original knowledge-competency scores below 75, not a validated prevalence study. CSV cells are escaped against spreadsheet formula injection. |
| Responsive structure       | Compact desktop header, sidebar/navigation, bounded cards, wrapping actions, horizontal table scroll, tablet/mobile layouts; portal navigation excluded from printing                | Source/control verification only; no claim of real viewport/zoom/screen-reader visual QA.                                                                                                                                                               |

## Rechecked existing capabilities

Accounts, real browser speech API wiring, real Gemini extraction/manual fallback, explained deterministic matching/partial matches/gaps, five-question self-assessment, twelve/legacy-eight practical rubric, authenticated images/videos, real video decoding, human recommendation/override/sign-off, PDF/print/share/QR/revocation, targeted reassessment, offline retry/conflicts and quality/calibration remain connected.

The automated suite substitutes AI/storage transports for deterministic regressions. The existing separate live-service checks use actual configured Gemini and Cloudinary with synthetic media and clean up their own assets. They do not validate practical competence or real-world AI accuracy.

## Verification

**63 unique automated tests pass: 51 backend/API/math/video + 12 React/offline/localization, zero failures and zero skips.** A final focused rerun of localization and the connected portal flow also passes (3 tests; repeats are not added to the 63 count). The localization run covers 48 routes/states in both Hindi and Marathi.

`npm run build`, bundle guard, generated offline-shell checks and compiled production smoke pass. The final entry is **427,215 bytes (427 kB)**, initial two-chunk static graph **690,598 bytes**, gzip **199,318 bytes**; every chunk stays below 500 kB and the initial graph below 700 kB. The earlier 392 kB figure predates the operational portals and additional translations. These are byte measurements, not browser timing/Lighthouse results. The shell includes 25 static assets and excludes private API/media.

The current live synthetic Gemini + Cloudinary recheck passes: four extracted skills, twelve criterion observations, private image upload, justified human override and a signed-off 93% result; the test removed its own cloud asset. Actual video decoding remains covered in the full automated suite and connected flow; the separate earlier live-video run is documented in REMAINING-TASKS.md.

Fresh logs are under ignored `server/data/portal-final-tests.log`, `portal-focused-final-ui.log`, `portal-final-build.log`, `portal-bundles.log`, `portal-shell.log`, `portal-production.log` and `portal-live-providers.log`.

The connected portal test creates and deactivates an account through the UI, assigns a real synthetic candidate, updates the worker's profile, displays the assigned assessor/batch, restores an offline declaration after remount and verifies the synced server record. It also exercises separate human AI-review notes and the voice-remark recognition contract. The existing connected workflow covers image/video review, human sign-off, Passport/PDF/QR/share, reassessment, consistency CSV and calibration.

No browser access denial was bypassed. Tests operate source in JSDOM and call a local API with isolated test databases. Physical browser, microphone, installed-PWA lifecycle, camera QR and native sharing are not represented as tested here.

## Files

New implementation:

- `shared/management.ts`: scoring/settings/rubric revision/sync telemetry types.
- `server/src/management-models.ts`: additive settings, immutable rubric versions, reported device sync metadata and account-change mutex.
- `server/src/management.ts`: protected operational administration, own worker profile/portal, separate assessor AI review and analytics/export routes.
- `client/src/pages/WorkerPortal.tsx`: worker dashboard/profile/skills/Passport/reassessment/evidence views.
- `client/src/components/PortalNavigation.tsx`, `AIReviewDecision.tsx`, `VoiceNote.tsx`.
- `client/src/portal.css`, `client/src/locales/management.ts`.
- `server/test/management.test.ts`, `client/test/management.test.tsx`.
- This handoff.

Updated:

- Shared: `types.ts`, `advanced.ts`, `assessment.ts`.
- Server: `models.ts`, `advanced-models.ts`, `app.ts`, `services.ts`, `sync.ts`, `assessor.ts`, `features.ts`, `evidence.ts`, `media.ts`, `quality.ts`, `passport-pdf.ts`.
- Client: `App.tsx`, `main.tsx`, `components/common.tsx`, `components/OfflineStatus.tsx`, `store/session.tsx`, `services/offline.ts`, `pages/Admin.tsx`, `pages/Assessor.tsx`, `pages/Worker.tsx`, `pages/Auth.tsx`, `pages/Quality.tsx`, `pages/Passport.tsx`, `locales/messages.ts`.
- Tests: existing localization fixtures and private-video ownership tests now distinguish the owning worker's new permitted access from unrelated workers. `scripts/production-smoke.mjs` additionally checks compiled operational endpoints, worker-role denial and immediate account-deactivation enforcement.
- Documentation: `README.md`, `AUDIT-FINAL.md`, `ADVANCED-IMPLEMENTATION.md`, `REMAINING-TASKS.md`.

## Setup and data changes

**New environment variables: none. New npm dependencies: none.** Existing server secrets stay private and unchanged. No configured development/production database was reset.

Existing installations receive additive model collections/indexes on startup. Missing legacy account status/version is interpreted as ACTIVE/0. Existing assessment policy/rubric fields are optional and use legacy defaults. New assessments save QP/rubric/policy snapshots. Settings initially use the existing demo electrician pack and default 30/70 scoring. Qualification seeding now inserts missing packs rather than overwriting administrator edits.

```powershell
npm ci                         # only on a new checkout/install
npm run build
npm run dev
# Separate checks (isolated local test Mongo on 27027 must be available):
npm test
npm run test:bundles
npm run test:shell
npm run test:production
# Optional configured live provider recheck:
npm run test:live-assessment -w server
```

Existing demonstration accounts, when enabled: `worker@dakshsetu.demo`, `assessor@dakshsetu.demo`, `admin@dakshsetu.demo`; password `demo123`. Public registration still creates workers only. Admin-created accounts need a new 12+ character password. Use the documented protected bootstrap CLI for the first real administrator. Do not publish demo credentials as production access.

## Manual acceptance checklist

1. Sign in with each role. Verify the compact header has language/sign-out; public navigation remains for signed-out visitors. Confirm each role's navigation and Help.
2. In Admin → User management, create a synthetic worker and assessor; filter/search; change a role and deactivate/reactivate with a reason. Confirm deactivated credentials/token requests fail. Confirm own-admin access change is rejected.
3. Complete a worker declaration/confirmed match/quiz. In Admin → Assessment monitoring, assign an active assessor with a batch, future date and reason. Verify the worker dashboard and assessor candidate page show actual values.
4. Start the assigned practical case. Verify IN_ASSESSMENT, workload and batch progress. Reassign an open case with a reason and confirm the old assessor cannot read/edit it. Signed-off reassignment must fail.
5. In qualification packs, add/edit a prototype pack, its NOS/tasks/skills and NSQF level. Create a rubric version with weights totaling 100. Verify invalid totals or missing safety criteria fail.
6. Change active QP/scoring thresholds/languages using settings. Create a new worker assessment and verify the selected frozen rules. Confirm an older assessment/Passport does not change.
7. Upload an image/video as the owning worker and preview it; retry failure/offline queue. Another worker must be denied. Only the assigned human assessor may score/analyze/finalize.
8. As assessor, complete all criteria, type/speak remarks where supported, attach criterion evidence and save/resume. Low mandatory-safety scores must warn.
9. Run evidence AI. Accept/correct/reject in the separate review panel. Verify original AI text, human notes, IDs/time and AI/human difference in admin record/audit. Explain any differing final score and sign off. Completed records must stay locked.
10. Download/print/share Passport; verify QR on a phone. In admin, inspect credential history and revoke with a reason. Public page must show REVOKED without private evidence/contact data.
11. Request and complete one weak-skill reassessment with genuinely new evidence. Confirm original result remains and credential history/revision updates; revocation must remain permanent.
12. In calibration management, create/assign a sample. An unassigned assessor must not see/submit it. The assigned assessor scores before seeing the reference; admin sees score/reference/deviation.
13. Leave quality in no-data mode until real ratings exist. Use Demo Dataset only with its synthetic warning. Import a valid paired CSV and verify calculated metrics, exclusions and undefined panels.
14. Open the declaration/quiz/assessor case online, disconnect, edit/save, reload, reconnect and inspect the actual DB value. Confirm failures retain drafts/media, conflicts require review and no duplicate upload occurs.
15. In sync monitoring, inspect last reported metadata and request retry. It must run on the owner's next active online device; it must not claim remote access to unsent media. Export actual reports and check denominators/batch/district/quality notes.
16. On the presentation laptop/tablet/phone, check viewport fit, 200% zoom, keyboard use, microphone permissions, audio output, installed PWA, real offline lifecycle, QR camera and native sharing. Deploy manually and repeat HTTPS/origin/provider checks.

## Strict PS requirement coverage

| PS Requirement                   | Implementation Found                                                                    | Status  | Evidence / File / Route                                | Fix Needed                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Structured self-declaration      | Text/voice, persisted profile and recoverable offline declaration                       | PASS    | Worker flow; `syncDeclaration`; declaration queue test | Physical voice/permissions validation                            |
| NSQF/QP mapping                  | Explained 60/20/20 mapping, editable versioned demo packs and frozen snapshots           | PARTIAL | Matching API; `/admin/qualifications`                  | Independently verified current official blueprint                |
| Practical skill checklist        | Twelve anchored criteria, safety warnings, legacy compatibility                         | PASS    | Assessor practical tab; frozen rubric revision         | Real trade-expert validation                                     |
| Image/video assessment aid       | Private uploads, previews, real decoding and optional Gemini observations               | PASS    | Evidence/video APIs; existing live synthetic checks    | Validate real-work accuracy and deployed runtime                 |
| Standardized scoring rubric      | Fixed 0–3 scale, controlled weights/versions and frozen policy                           | PASS    | Shared calculation; admin rubric/version tests         | Institutional approval of scoring scheme                         |
| Assessor variance reduction      | Shared rubric, calibration/deviation and quality comparison tools                       | PARTIAL | Quality/calibration dashboards                         | Controlled real multi-assessor comparison                        |
| Competency profile               | Persisted breakdown, strengths/gaps, worker result and Passport                         | PASS    | Worker/result; private Passport                        | Usability study                                                  |
| Certification recommendation     | Four human-confirmed recommendations and frozen threshold policy                        | PASS    | Finalization API                                       | Issuing-authority integration remains future scope               |
| Human assessor sign-off          | Assigned assessor, evidence, reasons, confirmation and lock                             | PASS    | Finalize/version/authorization tests                   | Presentation-device check                                        |
| AI does not replace assessor     | Raw AI kept separate; explicit human review and final decision                          | PASS    | AI-review/override tests                               | None for prototype authority boundary                            |
| Offline data capture             | IndexedDB declaration/quiz/rubric/media and account isolation                           | PARTIAL | Offline/API/connected remount tests                    | Real installed-browser lifecycle/eviction checks                 |
| Later sync                       | Version checks, receipts, retry/backoff, media metadata first and reported counts       | PARTIAL | Queue/reconnect/telemetry tests                        | Deployed browser/network validation                              |
| One complete trade               | Connected Electrician workflow                                                          | PASS    | End-to-end source/API tests                            | Current official trade blueprint still separate                  |
| Assessor scoring interface       | Live candidates, rubric, evidence, review, recommendation, sign-off                     | PASS    | Assessor pages and connected workflow                  | Real-device acceptance                                           |
| Consistency improvement evidence | No real paired human ratings supplied; synthetic demonstration only                     | FAIL    | Honest no-data quality screen                          | Collect independent human ratings before claiming improvement    |
| Certification integrity          | Role/status/ownership, snapshots, sign-off locks, public checksum, permanent revocation | PASS    | Auth/credential/reassessment/admin tests               | Production key management, institutional identity and operations |

Strict judgment scores remain **88/100 PS coverage, 93/100 functional prototype, 84/100 SIH demo readiness, 57/100 production readiness**. New controls resolve software gaps but do not manufacture the external evidence behind those remaining limits.

P0: perform the intended-device/browser checklist and retain prototype/synthetic disclosures. P1: verify current official QP approval, collect paired assessor ratings and complete the user's manual HTTPS deployment. P2: password recovery/MFA, institutional identity checks, backups/retention, durable distributed operations and scale testing. These production controls were not silently represented as complete.

### 🌐 Community Wisdom: [Architecting for Trust: Building a Multi-Role Admin Platform with React and Express](https://dev.to/harshpandhe/architecting-for-trust-building-a-multi-role-admin-platform-with-react-and-express-18kb)

> **Source**: [Harsh Pandhe](https://dev.to/harshpandhe)
> **Tags**: `react`, `node`, `security`, `fullstack`
>
> This practitioner account emphasizes server-side authorization alongside role-specific interfaces. There were no comments to evaluate. DakshSetu additionally reloads account role/status on each protected request and tests mutations directly; UI visibility alone is not treated as authorization. This is one experience report, not evidence of community consensus.
>
> 🔗 [Read Full Discussion](https://dev.to/harshpandhe/architecting-for-trust-building-a-multi-role-admin-platform-with-react-and-express-18kb)

NOT READY

The local prototype can demonstrate the connected software workflows, including the previously missing operational portals.
Fully verified PS compliance still lacks a current independently approved QP blueprint and real assessor-improvement evidence.
Physical presentation-device/browser checks and deployed behavior remain unverified; hosting is intentionally left to the user.
