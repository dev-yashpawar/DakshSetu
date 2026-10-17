# Local page verification — 17 October 2026

## Running services

- Website: http://127.0.0.1:5173/
- API: http://127.0.0.1:4000/api/health
- Started with `npm run dev`. The API reports MongoDB connected. No configured application database was reset, and no actual worker assessment or profile was edited by the read-only page checks.

## Live checks

`npm run test:local-pages` passed **91 checks, zero failures** against the running development website/API. It checks delivery, module compilation responses, authenticated read-only page-data endpoints, actual assigned candidate details and role restrictions. HTML shell delivery is not evidence that a page rendered correctly in a browser.

| Area | Routes checked for HTML shell delivery |
|---|---|
| Public / authentication | `/`, `/start`, `/login`, `/login/worker`, `/login/assessor`, `/login/admin`, `/register`, `/about`, `/help`, `/account` |
| Worker | `/worker`, `/worker/dashboard`, `/worker/profile`, `/worker/myskills`, `/worker/passport`, `/worker/reassessment`, `/worker/evidence`, `/worker/trade`, `/worker/years`, `/worker/describe`, `/worker/skills`, `/worker/match`, `/worker/quiz`, `/worker/result` |
| Assessor | `/assessor`, `/assessor/candidates`, `/assessor/assessments`, `/assessor/reports`, `/assessor/calibration` |
| Admin | `/admin`, `/admin/users`, `/admin/assessors`, `/admin/qualifications`, `/admin/assessments`, `/admin/batches`, `/admin/passports`, `/admin/calibration`, `/admin/quality`, `/admin/sync`, `/admin/analytics`, `/admin/audit-log`, `/admin/settings` |
| Verification / fallback | `/verify/unknown-credential`, `/passports/unknown-assessment`, `/missing` |

| Live check group | Count | Result |
|---|---:|---|
| API health | 1 | Pass |
| SPA route shells | 45 | Pass |
| Logos and main page modules | 10 | Pass |
| Worker / assessor / administrator login | 3 | Pass |
| Worker page-data endpoints | 3 | Pass |
| Assessor page-data endpoints | 4 | Pass |
| Admin page-data endpoints, CSV included | 14 | Pass |
| Assigned candidate discovery and details | 4 | Pass |
| Signed-out and cross-role denial | 6 | Pass |
| Unknown credential response | 1 | Expected 404 |

Machine-readable detail: `server/data/local-page-check.json`. The report excludes session tokens, credentials, candidate names and candidate record IDs. The reusable script is `scripts/local-page-check.mjs` and requires the local app running with existing demo accounts enabled. It fails rather than modifying configuration or provisioning accounts if demo login is disabled.

## UI and connected workflow checks

The complete local UI suite passes **14/14 tests, zero failures**. It renders all **51 route/state cases in Hindi and Marathi** using controlled page fixtures, checks language switching and errors, and exercises real React forms against isolated Express/MongoDB instances for role login, DigiLocker demo, account management, assignments, offline work, evidence, assessor sign-off, Passport, reassessment and quality/calibration. These are JSDOM tests, not a real browser session. Actual user records are not used for test writes. Full output: `server/data/local-pages-ui.log`.

The previous unchanged backend checkpoint passed 53 API tests; those were not rerun as part of this page-only verification.

## Browser limitation

The requested browser check was retried. The browser tool failed before obtaining a tab: `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. No browser screenshots, real viewport checks, screen-reader checks or physical camera/microphone checks were completed. The results above do not claim that each page was visually tested in a browser. No automatic test failures have been found in the live route/API checks.
