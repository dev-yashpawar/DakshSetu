# Portal UI refinement — 17 October 2026

This update addresses the supplied screenshot: clipped logo, too many competing panels/actions, repeated introductions and inconsistent navigation between worker, assessor, admin, quality and calibration screens. The assessment/storage/authorization backend and supplied logo asset were preserved.

## Changes

| Before | Now |
|---|---|
| Compact header changed image width while retaining old negative crop offsets | A separate signed-in header uses the original PNG inside a proportional SVG viewport. No legacy absolute-position crop class applies. A geometry test checks every visible artwork pixel fits the viewport. |
| Tagline bar, tall masthead, navigation and large status strip consumed vertical space | One compact brand/language/sign-out header, quieter healthy sync status and a small footer. Offline, failure and conflict messages remain prominent. Prototype disclosure remains in the footer. |
| Thirteen admin destinations formed one long list | Four daily-work links plus labelled expandable Assessment tools, Quality tools and More tools. The current group opens automatically. Mobile has an expandable workspace menu. |
| Eight overview metrics, three orange actions and three reports competed on the dashboard | Four operational counts, a primary assignment action and a short queue/next-action panel. All eight metrics, detailed trade/district/gap reports and CSV export remain on Analytics and reports. |
| Every action looked equally important | One orange primary action, restrained outlined secondary actions and text links; smaller page headings, consistent table/panel typography and spacing. Worker touch actions remain at least48px high. |
| Assessor had a large marketing banner and a repeated sidebar explanation | A compact page heading, consistent sidebar and expandable assessment guidance. Candidate, rubric, evidence, AI limitations, sign-off and safety warnings retain their workflows. |
| Quality/calibration felt disconnected from their role's workspace | Both use the same role sidebar and content structure as the rest of the portal. |
| Worker dashboard displayed six equal cards before the actual next step | The next valid action comes first; three compact trade/experience/status summaries follow. Assessor/schedule/batch details are aligned clearly. |
| Eight worker navigation links competed above the form | Dashboard, My assessment and Skill Passport stay visible. Profile, skills, evidence, reassessment and Help are available in More. The assessment link highlights the actual active journey. |
| Incomplete worker pages sometimes led to a result route that immediately redirected | Skills and pending Passport/reassessment/evidence views now link to the valid current assessment/start step. Signed-off workers go directly to their Passport. |
| Large raw audit objects expanded table rows | Object/array details expand on request. Stored data and audit history remain intact. |

## Files

- Updated `client/src/components/common.tsx`, `PortalNavigation.tsx`, `OfflineStatus.tsx`.
- Added `client/src/components/PortalSidebar.tsx`; shared role navigation is reused across workspaces.
- Updated `client/src/pages/Admin.tsx`, `Assessor.tsx`, `Quality.tsx`, `WorkerPortal.tsx`, `client/src/App.tsx`, `client/src/portal.css` and the Hindi/Marathi message catalog.
- Added `client/test/portal-layout.test.tsx`; updated connected portal/workflow tests for the grouped navigation and concise assessor dashboard title.
- No new package, environment variable, server model or migration.

## Verification

Production build, bundle guard, generated offline-shell checks and compiled-server smoke checks pass. The entry chunk is 431,310 bytes; the initial static graph is 694,693 bytes (200,196 gzip). The shell includes all 26 static assets. Logs are under ignored `server/data/ux-*.log`.

All 13 UI tests pass across the full suite and the final targeted connected-portal recheck. The full run passed 12/13; its native-summary keyboard assertion was corrected to reflect JSDOM's capabilities, and that connected test then passed (27.4 seconds). Backend source is unchanged in this UI follow-up; the previous 51 API tests and live-provider verification are documented in PORTAL-COMPLETION.md, rather than claimed as rerun here.

- Logo geometry check: the complete supplied artwork lies inside the portal viewport; the element does not use the legacy crop class.
- English message coverage plus all 48 routes/states in Hindi and Marathi.
- Real connected UI/API test for dashboard simplification, grouped link discovery, account management, assignment, worker profile editing, offline declaration recovery, human AI review and voice-note contract.
- Existing end-to-end worker/assessor/Passport/QR/PDF/share/reassessment/quality/calibration flow, including actual local video decoding with controlled AI/storage transports.
- Offline persistence, acknowledgment races, conflicts, bounded retries, account isolation, media metadata-before-binary and storage failures.
- Production compilation, lazy bundle guard, generated offline shell and compiled-server route/authentication smoke.

Tests run local source in JSDOM and use isolated MongoDB databases. The temporary test DB on 27027 was restarted because it was not running; the configured application database was not reset. JSDOM lacks native summary Enter activation, so the regression opens that native disclosure by click and verifies that its destination link accepts focus. Native keyboard activation and browser tab order remain manual checks.

No real browser viewport screenshots, screen-reader session or device usability study were produced. Existing browser-access restrictions were respected. Responsive source rules cover desktop, tablet and narrow mobile widths; actual zoom/viewport/device validation remains a manual check.

## Quick review

1. Refresh the existing site and sign in. Confirm the full supplied logo, language selector and sign-out button in one header.
2. Admin Dashboard: four cards, one orange assignment action, no trade/district report tables. Follow Analytics and reports to access the detailed reports and export.
3. Open each admin navigation group. Check the active group opens when entering a nested page. On a phone, open Workspace navigation first.
4. Open the assessor dashboard/candidate/quality/calibration routes. Confirm consistent sidebar and compact headings; expand Assessment guidance when needed.
5. Worker Dashboard: follow the next action; inspect More for profile/skills/evidence/reassessment. Confirm pending pages return to the current assessment and signed-off results open the Passport.
6. Check the intended laptop at 100% and 200% zoom, phone portrait/landscape, keyboard navigation and print. These physical checks are not represented as automated visual QA.

### 🌐 Community Wisdom: [Why I cut my dashboard from 12 metrics to 5 — and decisions got faster](https://dev.to/toshihiro_shishido/why-i-cut-my-dashboard-from-12-metrics-to-5-and-decisions-got-faster-40mp)

> **Source**: [toshihiro_shishido](https://dev.to/toshihiro_shishido)
> **Tags**: `dashboard`, `analytics`, `datavisualization`
>
> This practitioner report separates daily operational metrics from diagnostic reports. It informed the smaller overview and dedicated analytics page. It concerns ecommerce; its performance/decision-time claims are not DakshSetu results. No substantive comments were available, so this is one design experience rather than demonstrated consensus.
>
> 🔗 [Read Full Discussion](https://dev.to/toshihiro_shishido/why-i-cut-my-dashboard-from-12-metrics-to-5-and-decisions-got-faster-40mp)
