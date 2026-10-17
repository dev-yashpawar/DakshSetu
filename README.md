# DakshSetu — Phases 1–14 and advanced assessment features

**A bridge from practical competence to formal recognition.**

Render backend build fix: [portable server build, shared-source requirements and verified Node settings](RENDER-BUILD-FIX.md). With the current sibling `shared/` source, leave Render Root Directory blank (repository root) and run its commands inside `server`; no shared logic is duplicated.

Deployment: follow [the current production guide](DEPLOYMENT.md). The Render template now uses Docker with FFmpeg; production validates the public origin and server configuration. Use `npm run package:deploy` to make a source archive without local secrets or databases. Hosting remains manual.

Latest login update: [separate role login pages and the explicitly labelled DigiLocker mock](LOGIN-UPDATE.md). **67 tests pass** (53 API + 14 UI), with 51 routes/states checked in Hindi and Marathi. Real DigiLocker integration is not enabled or approved. Browser inspection could not start because its runtime could not write kernel assets.

Latest UI refinement: [compact branding, clearer role navigation and connected next steps](UI-REFINEMENT.md).

Advanced handoff: [implementation, setup, model changes and manual checklist](ADVANCED-IMPLEMENTATION.md). Review [the updated technical audit](AUDIT-FINAL.md) alongside the preserved baseline. New assessments use the twelve-criterion rubric; original eight-criterion records retain their scoring. Public QR verification, direct PDF, focused reassessment, offline media and consistency/calibration are connected. `/admin/quality` defaults to an honest no-data state; its clearly labelled synthetic demo is never saved as real results. Set `PUBLIC_APP_URL` when deploying manually.

Operational portals: [role-by-role completion, re-verification and limits](PORTAL-COMPLETION.md). Signed-in headers now show language and sign-out controls; administrators have operational account, assignment, qualification/rubric, calibration, Passport, sync, analytics and settings tools. Worker dashboard/profile/skills/evidence pages are connected. Previous operational checkpoint: **63 tests passed**, 48 routes/states checked in Hindi and Marathi, production build/smoke and live image providers passed. See the latest login update above for current verification; current entry bundle435kB.

Earlier remaining-task work: [real video validation, smaller route bundles, loading recovery and source provenance](REMAINING-TASKS.md). On Windows x64, `npm run setup:video` installs the verified project-local FFmpeg/FFprobe runtime. Earlier checkpoint: **54 tests passed**; see the portal handoff for the current validation. `npm run test:bundles` guards route splitting and bundle sizes. Hosting remains manual.

An AI-assisted Recognition of Prior Learning prototype for the electrician trade. Workers declare their experience and complete a self-assessment. An assigned human assessor scores a practical task, uploads evidence, optionally consults Gemini image observations, and signs off a recommendation. **AI assists. The assessor decides.**

## Implemented scope

| Phase | Functionality                                                                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–5   | Registration and JWT sessions, MongoDB persistence, English/Hindi/Marathi worker journey, experience capture, Gemini skill extraction with manual fallback, qualification matching, five-question self-assessment and saved results |
| 6     | Assessor dashboard, candidate directory/details, assigned assessments and signed-off report records                                                                                                                                 |
| 7     | Versioned twelve-criterion practical rubric (legacy eight retained), scores 0–3, remarks, weighted scoring and resumable progress                                                                                                                                      |
| 8     | Private Cloudinary evidence upload, authenticated previews, metadata and retry protection                                                                                                                                           |
| 9     | Gemini image observations, confidence, warnings and limitations; manual review remains available                                                                                                                                    |
| 10    | Human override, required justification, explicit confirmation, saved recommendation and locked sign-off                                                                                                                             |
| 11    | Private Skill Passport from a locked assessment, real competency/rubric breakdown, print / Save PDF and JSON download                                                                                                               |
| 12    | Account-scoped Dexie caches, quiz and practical drafts, offline submissions, reconnect sync, bounded retries and explicit conflict review                                                                                           |
| 13    | Operational administration: account access, assignment/batches, qualifications/rubrics, calibration, credentials, sync, reports, settings and audit                                                                                                                                          |
| 14    | Responsive Passport/admin screens, translated status/errors, production offline shell, single-service hosting configuration and manual deployment guide                                                                             |

Public registration creates only workers. Administrators can create and manage privileged accounts; first administrators can also use the protected bootstrap CLI. Hosting is left to you; no live deployment was made. See [manual deployment](DEPLOYMENT.md).

## Start locally

Requires Node.js 22+, npm and MongoDB Community Server or an Atlas URI.

```powershell
npm install
# Only if server/.env does not already exist:
Copy-Item server/.env.example server/.env
npm run dev
```

Open [DakshSetu](http://127.0.0.1:5173). Vite uses port 5173 and Express uses port 4000. With `MONGODB_URI` configured, the launcher uses that database. Otherwise it starts MongoDB on port 27027 with persistent files in ignored `server/data/mongo/`. On this computer it detects `C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe`; elsewhere use PATH or `MONGOD_PATH`.

Development seeding preserves existing users, passwords and worker progress. To seed explicitly, run `npm run seed`.

## Environment

Keep secrets in `server/.env`, never in `VITE_` variables. Restart the API after changing environment values.

| Variable                | Purpose                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`           | Database URI; empty uses `mongodb://127.0.0.1:27027/dakshsetu`                                                                      |
| `JWT_SECRET`            | Random secret, minimum 32 characters. Development generates a temporary secret if omitted; a restart then requires signing in again |
| `GEMINI_API_KEY`        | Skill extraction and optional image observation; failures expose a manual path                                                      |
| `GEMINI_MODEL`          | Default `gemini-2.5-flash`                                                                                                          |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name                                                                                                               |
| `CLOUDINARY_API_KEY`    | Server-only Cloudinary API key                                                                                                      |
| `CLOUDINARY_API_SECRET` | Server-only Cloudinary API secret                                                                                                   |
| `CLIENT_URL`            | Comma-separated exact allowed origins; defaults to localhost/127.0.0.1 port 5173                                                    |
| `PORT` / `HOST`         | API defaults: 4000 / 127.0.0.1                                                                                                      |
| `SEED_DEMO`             | Production seeds only when explicitly `true`; development seeds automatically                                                       |
| `VITE_API_BASE_URL`     | Optional frontend API base; default `/api` uses Vite’s proxy                                                                        |
| `TRUST_PROXY`           | `1` only for a matching single reverse proxy, such as Render; default `0`                                                           |
| `ALLOW_DEMO_LOGIN`      | Known demo accounts are disabled in production unless explicitly `true`                                                             |

Missing Cloudinary configuration produces a visible upload error. Missing/failed Gemini image analysis does not prevent manual scoring and sign-off after evidence is uploaded.

## Try the workflow

All demo passwords are `demo123`:

| Role          | Email                     |
| ------------- | ------------------------- |
| Worker        | `worker@dakshsetu.demo`   |
| Assessor      | `assessor@dakshsetu.demo` |
| Administrator | `admin@dakshsetu.demo`    |

1. Choose a language and register a worker, or use the demo worker.
2. Select Electrician, experience range and a description: “I do residential wiring, install switches and MCBs and diagnose electrical faults.”
3. Analyse with Gemini or choose skills manually; confirm the skills.
4. Review the demo qualification match, answer all five questions and submit.
5. Sign out. Use **For assessors** on the home page, or `/login?role=assessor`, and sign in with the assessor account.
6. Open the worker from Candidates and select **Start assessment**. Claiming assigns the assessment exclusively to that assessor.
7. Score the twelve criteria (eight only for legacy records) for **Install and test a basic switchboard**, add remarks and save. Partial practical scoring can be resumed.
8. In Evidence, upload a JPEG, PNG or WebP. Optionally run AI observation and review its warnings and limitations.
9. In Recommendation, enter the approved practical score, select a recommendation, provide any required reason, confirm and finalise.
10. Sign in as the worker again to see the saved result. Signed-off assessment fields are locked.
11. Open **View Skill Passport**. Print / Save PDF uses your browser's print dialog; Download passport data exports the saved JSON snapshot. Access is limited to the worker, assigned assessor and administrators.
12. Use `/login?role=admin` for administration. Use its dedicated navigation to manage users, assignments/batches, qualification and rubric versions, calibration, credentials, sync, analytics, settings and audit.

The seeded qualification **Electrician – Domestic Solutions / DEMO-ELE-001 / NSQF Level 4 (demo)** and recommendation thresholds are prototype data, not an official qualification pack or government certificate.

## Scoring and sign-off

Each practical criterion is scored 0–3 and weighted. `practical.rubricScore` preserves the saved rubric total. `assessorScore` and `practicalScore` store the human-approved practical score. The raw AI 0–10 suggestion remains in `aiObservation`; `aiSuggestedScore` is normalised to 0–100 for comparison.

```text
Overall = round(self-assessment × 0.30 + approved practical score × 0.70)
```

Demo recommendations: 75+ **Competent**, 60–74 **Competent with minor skill-gap training**, below 60 **Further assessment required**. The assessor can also choose **Not yet competent**.

Finalisation requires all eight saved criteria, an evidence image and human confirmation. A reason of at least ten characters is required when the approved score differs from the rubric, the recommendation differs from the calculated recommendation, or the approved score differs from AI by more than 20 percentage points. AI is optional and never signs off. History records the assessor’s actions and justification.

## Evidence and persistence

Uploads allow six images per assessment, 5 MB each and 16 million decoded pixels. Actual image format must match its MIME type. Unsupported, corrupt and multi-frame input is rejected. The API removes EXIF and creates a bounded JPEG. Cloudinary assets use authenticated delivery. Role- and ownership-checked API routes serve previews; normalized bytes are stored privately in MongoDB and sent directly to Gemini without fetching arbitrary user URLs.

Versions reject stale concurrent writes. Upload retry IDs prevent duplicate attachments. Failed concurrent attachment commits clean up only their newly created evidence. Assigned assessments are visible to their assigned assessor and worker owner. Signed-off edits return HTTP 423.

Startup migration only adds missing version/array defaults to older records. Existing worker progress and Phase 1–5 results remain intact. Saved records persist on the server. Quiz answers and practical scores/remarks also autosave as device drafts. Other unsubmitted form text remains page state. Speech capture/read-aloud depend on browser support and permissions; typing remains available.

## Basic offline support

Open the profile/questions or assigned candidate online first. With the same signed-in session, quiz answers and practical rubric scores/remarks survive reloads in IndexedDB. Submit/save offline to queue the update; reconnect to sync. A queued quiz has no final score until the server computes and stores it. Account ownership, version checks and signed-off locks remain enforced on the server. Conflicts preserve the device draft for explicit comparison/discard, and retry attempts are bounded.

Production builds include a versioned service worker for the static application shell and all lazy page chunks. It excludes private API/evidence requests. After its first successful online installation and controlled reload, previously opened own-account screens can load offline. Development Vite does not install this worker. AI, uploads, new sign-ins and final sign-off require a connection. Device data is account-scoped but remains on that browser until cleared; it is not a backup. Closing the tab ends the session token, so sign in online again to resume retained drafts.

## Verify

Start local test MongoDB on port 27027 with `npm run db`. If development uses Atlas, that launcher skips local startup. In a separate terminal on this computer, run the following instead; tests do not use the development database:

```powershell
New-Item -ItemType Directory -Force server/data/test-mongo
& 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' --dbpath "$PWD/server/data/test-mongo" --port 27027 --bind_ip 127.0.0.1
```

Then run the checks from the repository root:

```powershell
npm test
npm run test:localization
npm run build
npm run test:shell
npm run test:production
npm audit
# Optional live provider checks using server/.env:
npm run test:live -w server
npm run test:live-assessment -w server
```

`npm test` runs the original API checks, assessor/Passport/admin/sync tests, Dexie tests using fake IndexedDB, localization checks, and a React workflow in JSDOM against real Express/MongoDB including offline reload/reconnect. Regular tests control provider responses. The live assessment test sends a synthetic description and labelled illustration to Gemini, uploads the illustration to Cloudinary, verifies sign-off/result retrieval, then removes its own cloud asset. The shell and production smoke checks require a completed build; production smoke uses temporary port 4001 and its own disposable local database.

All tests create unique `dakshsetu_test_<uuid>` databases and verify their exact name before cleanup. No development database reset occurs. The legacy API suite accepts `TEST_MONGODB_BASE_URI`; assessor, React and live suites use local port 27027.

See [Phase 11–14 verification](TESTING-PHASES-11-14.md) for current results and limitations. [Phase 6–10 verification](TESTING-PHASES-6-10.md) and [Phase 1–5 verification](TESTING.md) are historical reports.

## Project structure and APIs

```text
client/src/       React, Router, Hook Form, Zod, Axios, Tailwind/CSS
client/test/      JSDOM / Testing Library workflow test
server/src/       Express, JWT, bcrypt, Mongoose, Gemini, Cloudinary, Sharp
server/test/      Supertest against real MongoDB
server/scripts/   Opt-in live provider checks
shared/           Types, validation, matching and practical scoring
scripts/db.mjs    Local MongoDB launcher
```

Answer keys remain server-side. Privileged routes enforce roles/ownership and service credentials stay outside the frontend bundle. The assessor module loads separately from the initial worker bundle.

```text
GET  /api/assessor/dashboard
GET  /api/assessor/candidates
GET  /api/assessor/candidates/:workerId
POST /api/assessments
GET  /api/assessments/:id
PUT  /api/assessments/:id/practical
POST /api/assessments/:id/evidence
GET  /api/assessments/:id/evidence/:evidenceId/content
POST /api/ai/analyze-evidence
POST /api/assessments/:id/finalize
GET  /api/passports/:assessmentIdOrWorkerId
POST /api/sync
GET  /api/admin/stats
GET  /api/admin/qualifications
GET  /api/admin/users
GET  /api/admin/assessments
GET  /api/admin/audit-logs
```

Existing worker/auth/qualification/self-assessment routes remain available. `/api/admin/audit-log` is also supported. Skill Passports are generated once from real saved data and reused; they carry the explicit prototype/non-government-certificate notice. Audit events cover confirmed skills, qualification mapping, self-assessment, practical score changes, AI observations, human overrides and sign-off. New audit records begin with these features; older records are not given fabricated historical events.

## Branding and UI

The supplied DakshSetu PNG is used unchanged for header, footer and favicon, with the tagline **A bridge from practical competence to formal recognition.** CSS hides only the PNG’s transparent outer margin. The [Seva First guidelines reference](https://sevainnovationchallenge.in/guidelines.html) informed Segoe UI typography, navy `#0b2a5b`, orange actions, pale `#f5f7fc` backgrounds, prominent headings, spacious cards and a two-row header. No government logos or affiliation claims are copied.

English, Hindi and Marathi cover public pages, forms, worker screens, the assessor workspace, Passport and administration, including rubric labels, sync status, errors, recommendations and dates. The selected language persists across navigation and reloads. Catalogs are in `client/src/locales/`; `useTranslate` subscribes to the session language. Form values and canonical identifiers stay unchanged. Names/descriptions, filenames, custom skills, email addresses and free-form evidence observations retain their recorded wording. The supplied logo artwork retains its embedded lettering.

The desktop logo is 170 px wide with a compact 120 px masthead; fluid columns and shorter-height laptop spacing accommodate desktop/laptop screens, with stacked layouts on smaller screens. See [localization and layout verification](TESTING-LOCALIZATION-LAYOUT.md) for coverage and visual-review limits.

No hosting was provisioned, as requested. `npm run build` prepares the API, frontend and offline shell. [DEPLOYMENT.md](DEPLOYMENT.md), `render.yaml` and `Dockerfile` provide the manual hosting handoff, including qualification-only seeding and safe privileged-account creation.
