# Advanced DakshSetu implementation and handoff

**Current operational-portal follow-up:** [PORTAL-COMPLETION.md](PORTAL-COMPLETION.md). The former read-only admin gap is now addressed; historical test counts and bundle sizes below describe the earlier checkpoint.

17 October 2026. See [the follow-up completion report](REMAINING-TASKS.md) for the latest video/runtime/performance results. Builds on the existing Phase 1–14 React/Express/MongoDB application. The original inspection is preserved in [AUDIT-BASELINE.md](AUDIT-BASELINE.md). Hosting remains manual; no account, service or deployment was created.

## Implemented behaviour

1. **Voice declaration:** actual browser SpeechRecognition/webkitSpeechRecognition, final editable transcripts, en-IN/hi-IN/mr-IN, fallback to typing. Declaration source and audit metadata persist. Controlled recognition events are tested; physical microphone permission/audio recognition remains manual.
2. **Qualification explanation:** persisted overlap/task/experience components, matched skills, conservative partial matches and gaps. House wiring can partially match Residential Wiring; it does not imply safety competence. The only qualification remains explicitly demo data.
3. **Versioned rubric:** twelve weighted 0–3 criteria, category/weight metadata, evidence references and mandatory safety warnings. New assessments use version 2. Older missing-version/version-1 assessments keep their original eight criteria and weights. Safety warnings do not auto-certify or replace assessor judgment.
4. **Image assistance:** normalized private images, actual multimodal Gemini request, validated criterion observations, visible evidence descriptions, confidence, uncertainty and warnings; AIAnalysis history. Human rubric, approved score and explanation remain separate.
5. **Video:** authenticated MP4/WebM upload, bounded size, metadata/hash/ownership checks, private playback. Optional FFmpeg/FFprobe pipeline samples six bounded frames for Gemini. The project-local FFmpeg/FFprobe runtime is installed and real MP4/WebM/sparse-frame decoding plus live synthetic Cloudinary/Gemini video analysis now pass. Hosts without both binaries still have explicit manual review. No continuous-action recognition is claimed.
6. **Offline media:** account-scoped IndexedDB retains image/video bytes and metadata; metadata is sent before binary upload on reconnect. Stable upload IDs, bounded retries, quota errors, conflicts and acknowledgement cleanup preserve pending work. Existing quiz and practical drafts still survive remount/reconnect. The service worker caches static assets, never private API/media responses.
7. **Credentials:** stable random credential IDs, QR link, minimal public verification, tamper-evident SHA-256 checksum, revision history and permanent admin-only revocation. Public verification shows no email, phone, evidence, internal remarks or account IDs. Revoked records expose no competency scores. Checksums are not digital signatures and cannot prevent a privileged database operator from recomputing them.
8. **PDF/share:** real server-generated A4 PDF with Unicode names, logo, original scores/rubric, strengths/gaps, history and QR. Print / Save PDF remains a fallback. Web Share, clipboard and selectable-link fallback are connected. Direct PDF labels are English; localized browser printing is available. The bundled Devanagari font is redistributed with its OFL licence.
9. **Focused reassessment:** workers request only a competency below the prototype 75% threshold. The original assigned assessor uploads new evidence, rates it 0–3, records an observation and confirms personal review. Original evidence bytes cannot be reused. Version checks and completed-attempt locks prevent replacement. A completed attempt appends persistent history and updates the credential revision/current competency; original overall score, rubric and recommendation remain intact. Reassessment never reactivates a revoked credential.
10. **Consistency and calibration:** `/admin/quality` opens as a finished “Not enough data yet” page with requirements, metric explanations, CSV upload and separate **Use Demo Dataset** mode. Demo ratings are synthetic, never written to the real dataset collection, and do not alter actual platform statistics. Its roughly **0.44 / 0.72** scores are computed from explicit synthetic ratings. Real imports persist, and can be selected again. Cohen’s Kappa is used for two assessors and Fleiss’ for three or more. Only complete units rated by the same panel in both conditions are compared; exclusions are reported. Degenerate constant ratings produce an undefined metric, not an invented value. The same-case assisted panel supplies a descriptive group-deviation indicator with an explicitly prototype 10-point review threshold. This does not establish bias or temporal drift. `/assessor/calibration` accepts independent practice ratings and then reveals the administrator-entered reference. Practice never affects worker credentials or the before/after experiment.

Actual platform statistics come from stored signed-off assessments: assessor count, per-assessor approved practical averages, practical score adjustments, and AI/human agreement within a clearly labelled prototype 20-point tolerance. Different candidate groups make ordinary assessor averages unsuitable for causal comparisons.

Latest landing-page update: the supplied transparent worker image is composed on the hero’s right side above an overlapping, compact white skill-profile card. The original preview remains; the photograph replaces its redundant avatar treatment. Local 600/900 px WebP variants preserve transparency and use responsive loading. The layout stacks on phones and keeps the existing navy/orange public-service style and prototype disclosure. The portrait is included in the generated offline shell.

## Verification results

| Check | Result |
|---|---|
| Full API / agreement-math suite | **43 passed**, zero failures, including actual decoder cases |
| Full React / IndexedDB / localization suite | **11 passed**, zero failures; 35 routes/states in Hindi and Marathi |
| Additional boundary rerun | **2 passed**: a revoked credential stays revoked after a later completed reassessment; oversized video returns the correct 10 MB limit |
| Production TypeScript / Vite / offline build | **PASS**; entry392.42 kB / framework263.38 kB; all JavaScript chunks below500 kB, with no size warning |
| Generated offline shell | **PASS**, 23 static assets including both worker portraits and lazy chunks; private API, POST and cross-origin exclusions |
| Compiled production server smoke | **PASS**; new deep links, protected quality/calibration/reassessment routes, invalid public credential, PWA icon dimensions, bootstrap/demo denial, secret and answer-key exclusion |
| Live Gemini + Cloudinary synthetic flow | **PASS**; four extracted skills, twelve criterion image observations, private upload, justified human override and signed-off 93% outcome; own cloud asset removed |
| PDF | **PASS**; actual two-page A4 PDF, Devanagari extraction, original 93% and QR URL; both rendered pages visually inspected |
| Live video / actual decoder | **PASS**; six resampled frames, twelve real Gemini observations, private Cloudinary video and own-asset cleanup; MP4/WebM/sparse/corrupt/overlong/missing-runtime tests |
| Dependency audit | **0 reported vulnerabilities** |

The connected React test covers real Express/MongoDB requests through offline quiz/rubric/image capture and reconnect, human sign-off, private Passport, new-evidence reassessment, revision/history, public verification, actual PDF response/download action, controlled native-share API, actual admin CSV import and actual calibration case creation/scoring. Provider transports and speech/share events are controlled in this test; the separate live provider test uses actual services. Test databases have exact generated names and are cleaned separately from the development database.

Local verification logs are under ignored `server/data/advanced-*.log`. Historical failed attempts were repaired and rerun; the results above refer to the final passing runs. No actual deployed/browser/hardware test is represented by these results.

## Files created

| Area | Files |
|---|---|
| Shared contracts and agreement math | `shared/advanced.ts`, `shared/consistency.ts` |
| Backend | `server/src/advanced-models.ts`, `media.ts`, `video.ts`, `credentials.ts`, `passport-pdf.ts`, `reassessment.ts`, `quality.ts` |
| UI | `client/src/components/VideoReview.tsx`, `PassportCredential.tsx`, `ReassessmentPanel.tsx`; `client/src/pages/Verify.tsx`, `Quality.tsx`; `client/src/locales/advanced.ts` |
| Assets | `server/assets/fonts/TiroDevanagariHindi-Regular.ttf`, `OFL.txt`; `client/public/icon-192.png`, `icon-512.png`, `landing-workers-600.webp`, `landing-workers-900.webp` |
| Tests/reports | `server/test/consistency.test.ts`, `AUDIT-BASELINE.md`, `AUDIT-FINAL.md`, this report |

## Files modified

- `shared/assessment.ts`, `types.ts`, `data.ts`, `validation.ts`: versioned rubric, match explanations and source/metadata contracts.
- `server/src/app.ts`, `index.ts`, `models.ts`, `features.ts`, `assessor.ts`, `evidence.ts`, `audit.ts`, `services.ts`: routes, persistence, sign-off generation, validated analysis and audit events.
- `client/src/App.tsx`, `pages/Worker.tsx`, `Assessor.tsx`, `Admin.tsx`, `Passport.tsx`, `services/offline.ts`, `localization.ts`, `locales/messages.ts`, `locales/phases.ts`, `phases-11-14.css`: connected navigation, controls, queue and translations.
- `server/test/features.test.ts`, `assessor.test.ts`; `client/test/workflow.test.tsx`, `offline.test.tsx`, `localization.test.tsx`: positive/negative and regression coverage.
- Workspace manifests/lockfile, `.env.example`, `Dockerfile`, `render.yaml`, PWA manifest, production smoke script, README and deployment guide.
- Landing composition: `client/src/pages/Landing.tsx`, `reference-theme.css`, localized image description, `scripts/build-offline.mjs`, `scripts/test-offline-shell.mjs`.

This workspace has no Git repository, so this is a functional change inventory rather than a Git diff.

## Environment and installation

Existing secrets remain in `server/.env` and are never embedded in the frontend. No new API account or key is required. Add on hosting:

```dotenv
PUBLIC_APP_URL=https://your-public-origin.example
# Optional, only after installing both executables:
FFMPEG_PATH=/absolute/path/to/ffmpeg
FFPROBE_PATH=/absolute/path/to/ffprobe
```

`PUBLIC_APP_URL` must be a trusted HTTPS origin without credentials, path or query (localhost HTTP allowed for development). It is not derived from request Host headers. Set `CLIENT_URL` to the same public origin. Existing required production settings and manual hosting steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

```powershell
npm ci
npm run build
npm test
npm run test:shell
npm run test:production
npm start
```

Tests require the isolated local MongoDB on port 27027. Development uses `npm run dev`. Added runtime dependencies are `pdfkit`, `qrcode` and `qrcode.react`, plus TypeScript declarations; they are already in the lockfile. No FFmpeg download or platform deployment is performed automatically.

If no test database is listening, start your installed MongoDB in a separate PowerShell terminal (adjust the executable path if necessary):

```powershell
New-Item -ItemType Directory -Force server/data/verification-mongo
& 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' --dbpath "$PWD/server/data/verification-mongo" --bind_ip 127.0.0.1 --port 27027 --wiredTigerCacheSizeGB 0.25
```

This is a separate local test instance, independent of the development/production MongoDB URI. Stop that terminal after testing. The normal development database helper skips local startup when a remote URI is configured.

## Database changes and migration

New collections: Credential, Reassessment, MediaIntent, AIAnalysis, CalibrationCase, CalibrationScore and ConsistencyDataset. Evidence gains optional private video bytes, analysis and reassessment linkage. Profile stores declaration source and complete match details. Assessments carry explicit rubric versions; original Passport snapshots remain immutable. Public verification events have the audit role `public`, never an authentication role.

Models initialise indexes on connection. No destructive migration/reset is needed. Missing rubricVersion means legacy version 1. Missing credential hashVersion means checksum version 1; new credentials use version 2. Existing assessments are not silently rescored. Back up the database before production upgrades and provision sufficient permissions for index creation. Credentials for old signed-off assessments are created lazily when their private Passport is opened.

For a fresh production database, after building:

```powershell
npm run seed:qualifications -w server
npm run bootstrap-user -w server
```

Set temporary `BOOTSTRAP_*` server secrets as documented, create one real administrator and assessor, then remove those secrets. Do not run the development demo seed in production. There is no seeded “real consistency result”; imported ratings are the only persistent experiment data.

Development demo accounts: `worker@dakshsetu.demo`, `assessor@dakshsetu.demo`, `admin@dakshsetu.demo`; password for all: `demo123`. Production disables these known accounts by default. Do not enable them for real worker information.

## CSV contract

```csv
case_id,assessor_id,condition,score
case-1,assessor-1,unassisted,2
```

This one row illustrates the format; it is insufficient to compute agreement. Optional `criterion_id` defaults to `overall`. Conditions must be `unassisted` or `assisted`; integer scores must be 0–3. Identifiers are 1–80 safe ASCII characters, maximum 5,000 rows / 1 MB. Standard quoted fields/CRLF are accepted; malformed quoting, duplicate cells and out-of-scale values are rejected. Use pseudonymous assessor identifiers; uploaded identities are not independently verified. Supply the same assessors, cases and criteria in both conditions. At least two complete paired units are needed. Adding a new assessor to only part of a dataset excludes incomplete panels; no unreported imputation is performed.

## Full manual checklist

1. Start locally, then repeat after your own HTTPS deployment. Confirm `/api/health`, deep-link refresh and production CORS. Create real roles using bootstrap.
2. At 1366×768, 1440×900, 1920×1080, 390×844 and 200% zoom, check compact logo, navigation, cards, scrolling tables and accessible form labels. Check English/Hindi/Marathi on every role/page, including error messages.
3. Register a worker; select Electrician, 5+ years; speak in each supported locale, permit microphone, edit transcript. Deny permission and test typing fallback. Confirm source/audit metadata and refresh/resume.
4. Run extraction, select/edit skills, inspect explanation/partial matches/gaps and complete self-assessment. Force Gemini failure and verify manual selection.
5. In a built HTTPS app, install/load the shell online and reload. Open quiz, go offline, answer/save, reload, reconnect and verify one server submission. Repeat rubric save with another account; check isolation/conflict handling and quota-error message.
6. As assigned assessor, score all twelve criteria, retain a weak criterion, save and refresh. Check mandatory-safety warning and criterion-specific image references. Confirm another assessor cannot claim/edit the case.
7. Offline, queue a new image and short video; reload; reconnect. Confirm metadata precedes binary transfer, retries do not duplicate, and acknowledged local bytes clear. Verify private playback and protected content URLs.
8. Run image AI, inspect visible observations/confidence/warnings. Disconnect providers and continue human review. If FFmpeg/FFprobe are installed, upload a real ≤60-second ≤1080p video and validate sampled-frame AI; otherwise confirm explicit unavailable/manual fallback. The decoder pipeline is validated with synthetic MP4/WebM patterns; repeat with your intended real practical clip and hosting runtime.
9. Enter approved score and recommendation, add an override explanation, confirm human sign-off. Check final weighted score, lock and audit. No worker/AI/admin endpoint should bypass assigned human sign-off.
10. Open Passport as worker/assigned assessor/admin; deny unrelated worker access. Scan QR on another device, inspect minimal public fields; test invalid ID and revocation. Compare original rubric/approved practical/overall values.
11. Download native PDF; test Devanagari name, logo, QR destination, multipage output and private access. Test Print / Save PDF, native share, cancellation, clipboard and manual copy fallback. Offline verification must ask for connection.
12. Worker requests the weak competency; assigned assessor uploads a genuinely new image, records 0–3 rating/observation and confirms. Verify current competency/revision/history update; original score/recommendation/rubric stay unchanged. Retry, stale version, reused evidence and second completion must not alter the result. A revoked credential must stay revoked.
13. Open `/admin/quality` with no data. Confirm finished “Not enough data yet”, requirements, metric notes and upload/demo actions. Use Demo Dataset; confirm synthetic warning and calculated results; leave demo and confirm actual datasets/statistics were not populated.
14. Upload a real paired CSV, refresh and reselect it; verify matching counts, exclusions and undefined constant-score handling. Import a three-assessor panel and confirm Fleiss Kappa. Reject duplicates/malformed/out-of-scale data. Do not present imported or synthetic data as a validated bias-reduction experiment.
15. Administrator creates a practice scenario/reference. Assessor scores independently in `/assessor/calibration`; reference is hidden until submission. Inspect deviation and ensure practice cannot change worker or experiment records.
16. Verify production demo login is disabled, secrets absent from built assets, private API/media excluded from service-worker cache, and server logs/errors do not reveal keys.

## Known boundaries and real versus controlled behaviour

All persistence, permission checks, score calculation, queue writes/sync, hashes, QR, PDF, CSV math and human reassessment are implemented. Ordinary tests substitute provider transports and browser speech/share events. A separate live synthetic test exercises actual Gemini skill extraction, actual private Cloudinary image upload, twelve image observations, override and sign-off, then removes its own cloud asset.

The original electrician qualification is demo/unverified; there is no official issuing authority integration. Synthetic consistency data is deliberately separated and proves no real improvement. Calibration reference quality depends on the administrator. No confidence intervals or controlled causal study are implemented. No real assessor ratings were provided.

Actual browser visual/zoom/mobile inspection, microphone/audio, native share sheet, camera/QR scanning and installed-PWA lifecycle remain manual: automatic localhost browser access was denied earlier and was not retried through another tool. Docker engine execution and public deployment are unverified. Video frame analysis now passes actual decoder and live synthetic-provider tests locally; install both native tools on the deployment host. Direct PDF labels are English; private names use the bundled Unicode font. Long-history PDFs should be sampled again before large-scale use. Route splitting and the reusable framework chunk remove the size warning; browser performance timing remains unmeasured.

Production hardening still needs backups/restores, account recovery, stronger identity/assessor onboarding, monitoring/retention, shared rate limits, file quotas/streaming and operational review. Private media bytes currently also reside in MongoDB to support authenticated retrieval; this is bounded for the prototype rather than a large-scale storage design.

### 🌐 Community Wisdom: [The Hidden Problems of Offline-First Sync: Idempotency, Retry Storms, and Dead Letters](https://dev.to/salazarismo/the-hidden-problems-of-offline-first-sync-idempotency-retry-storms-and-dead-letters-1no8)

> **Source**: [salazarismo](https://dev.to/salazarismo)
> **Tags**: `architecture`, `webdev`, `distributedsystems`, `nestjs`
>
> This practitioner article informed stable retry IDs, bounded retries and explicit conflicts. It is not evidence of community-wide consensus; the implementation is checked independently.
>
> 🔗 [Read Full Discussion](https://dev.to/salazarismo/the-hidden-problems-of-offline-first-sync-idempotency-retry-storms-and-dead-letters-1no8)
