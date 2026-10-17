# Phase 11–14 verification

Verified on 17 October 2026 (Asia/Calcutta). Scope includes Skill Passport, basic device drafts/offline sync, minimal read-only administration, responsive styling and a manual deployment handoff. Existing Phases 1–10 remain available. The user will deploy the application themselves; no hosting account, service or domain was provisioned.

## Results

| Check                                | Result                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                           | **41 passed, 0 failed, 0 skipped**: 32 API tests and 9 UI/offline tests.                                                                                                               |
| Localization                         | **32 routes/states × Hindi and Marathi**, plus live language switching, restored language preference, form validation and canonical API values.                                        |
| Full React workflow                  | Passed against real Express and isolated MongoDB, including offline quiz/rubric reloads, reconnection, human override, sign-off, private Passport and admin audit navigation.          |
| `npm run build`                      | Server/client TypeScript checks and Vite production build passed; generated offline shell contains all 9 static assets, including lazy page chunks.                                    |
| `npm run test:shell`                 | Generated service-worker handlers passed installation, activation, old-shell cleanup, offline navigation, lazy chunk retrieval and private request exclusion checks.                   |
| `npm run test:production`            | Compiled server passed health readiness, SPA deep links, authenticated-route enforcement, static cache headers, evidence-preview CSP, logo, service worker and client bundle checks.   |
| Production account setup             | Qualification-only seed created no demo users; privileged account bootstrap succeeded; repeated bootstrap refused to overwrite the account; original credentials still authenticated.  |
| `npm audit`                          | **0 known vulnerabilities**, including development dependencies. Production-only audit also returned 0.                                                                                |
| Docker                               | Template supplied; container build **not exercised**, because the installed Docker client could not connect to a running engine.                                                       |
| Browser visual / native print review | **Not verified this phase**. Earlier browser policy denied automatic localhost inspection and the user could not share a tab. No alternative browser automation was used to bypass it. |

## Functional coverage

**Skill Passport:** requires signed-off real assessment data; rejects unauthenticated requests, unrelated workers and unassigned assessors; allows the worker, assigned assessor and administrators. Generates a stable, persisted snapshot with actual self-assessment competencies and raw practical criterion scores, the human-approved practical score, final score, qualification/demo NSQF level, assessor, date, strengths, gaps and recommendation. Snapshot retries do not create duplicates. Worker/assessor React links display the same 93% result in the full workflow. Print invokes the browser's native Print / Save PDF dialog; JSON download exports the snapshot. It explicitly states **Prototype skill record · Not a government certificate**. Print invocation was tested, but generated PDF appearance/page breaks need a manual browser check.

**Basic offline operation:** uses real Dexie logic with fake IndexedDB for deterministic tests. Profile/qualification/question/candidate/Passport caches and drafts are account-scoped. Tests reopen the database and reload the React application while offline. The worker can answer, review and queue the quiz without a fabricated score, then reconnect for server scoring. The assessor can score all eight criteria offline, save, reload and sync against the real API before continuing with evidence and sign-off. Device data clearing requires pending updates to be reviewed/discarded and asks before removing unfinished drafts.

**Sync correctness:** concurrent retries use stable mutation IDs and increment the assessment version once. Reusing an ID with changed content is rejected. Stale versions and signed-off edits remain conflicts. Unsynced drafts survive until explicit resolution. An acknowledgement clears only the exact acknowledged draft revision; a newer draft created in flight survives. Tests cover account switches, expired offline authentication, quota/storage failure, retry limits, HTTP 429/503, conflict retention and explicit discard. Worker scores are calculated server-side; forged client score fields fail validation. IndexedDB transactions contain storage operations only; network requests are made outside the transaction, following [Dexie's transaction guidance](<https://dexie.org/docs/Dexie/Dexie.transaction()>).

**Administration and audits:** admin-only API access, credential/private evidence redaction, pagination validation, actual database counts and durable audit records for skills confirmation, qualification mapping, self-assessment, practical changes, AI observations, score override and sign-off. Navigation from statistics to tabular audit records was exercised in the full React flow; a stale-data render bug found by that test was fixed. No fabricated audit history was added to pre-existing records.

**Production serving:** one compiled Node service serves the API and React application. Direct worker/Passport/admin links return the SPA; private API routes require authentication and unknown API paths return JSON 404. Hashed assets have immutable cache headers; the service-worker script is revalidated. The frontend bundle contains neither service-key identifiers nor answer keys nor the smoke test JWT secret. Helmet's image policy permits local blob URLs used for authenticated evidence previews while retaining the other default directives, following [Helmet's configuration reference](https://helmet.js.org/).

## Full flow observed

1. Register a unique synthetic worker, capture electrician experience, extract four controlled skills, confirm and map the qualification.
2. Open questions online, disconnect, answer all five correctly and queue submission. Confirm no assessment exists in MongoDB yet.
3. Remount React while offline and restore the reviewed answers/queue. Reconnect; verify the stored self-assessment score is 100%.
4. Sign in as assessor, claim the candidate, score all eight criteria, disconnect and save locally. Confirm the server has no practical score yet.
5. Remount the candidate screen offline and restore all eight choices. Reconnect; verify the server saves 100% practical scoring and empties the queue.
6. Upload a synthetic evidence image, obtain controlled AI observations suggesting 40%, approve a human practical score of 90% with a reason, and sign off.
7. Verify final score **93%**, preserved AI suggestion, required justification and locked rubric controls.
8. View the private Passport as assessor and worker; verify the same stable snapshot. Test the Print action.
9. Sign in as administrator and navigate from the real statistics to the persisted sign-off audit record.

Regular tests use controlled Gemini and image-storage transports; live providers were not called again in this phase. Earlier live provider results remain documented in [Phase 6–10 verification](TESTING-PHASES-6-10.md). Test databases use generated `dakshsetu_test_<uuid>` / `dakshsetu_smoke_<uuid>` names and verify their exact names before deletion. They do not reset the development database. The production smoke process on temporary port 4001 was stopped after verification.

## Limits and manual handoff

- Deploy manually using [DEPLOYMENT.md](DEPLOYMENT.md), `render.yaml` or the optional `Dockerfile`. No deployment tokens were requested or used.
- Production offline reload requires the shell to install online over HTTPS (or localhost) and a controlled reload. Development Vite does not register it. The service-worker checks exercise generated handlers in Node, not a real browser lifecycle.
- Offline support covers cached own-account views, quiz answers and practical scores/remarks. Evidence upload, AI requests, new login and final sign-off require connectivity. Private API/evidence requests are excluded from the service-worker cache. Account-scoped IndexedDB caches intentionally store previously opened own-account data for offline use.
- Closing the tab ends the session token. Sign in online again to resume retained device drafts. Storage can be evicted by the browser and is not a backup.
- Fluid layouts and 900/600 px Passport breakpoints preserve the existing compact logo/laptop styling. Tables scroll within their panels, long IDs wrap, and phone layouts stack. Real viewport, zoom, browser font and native PDF review remain manual; no claim of pixel-perfect browser verification is made.
- Vite reports a main-bundle size warning: **727.08 kB minified / 215.50 kB gzip**. Admin, Passport and assessor pages are separate chunks. The build succeeds; further bundle reduction remains possible.
- The product remains the electrician prototype with demo qualification data. Its Passport is not an official certificate.

### 🌐 Community Wisdom: [The Hidden Problems of Offline-First Sync: Idempotency, Retry Storms, and Dead Letters](https://dev.to/salazarismo/the-hidden-problems-of-offline-first-sync-idempotency-retry-storms-and-dead-letters-1no8)

> **Source**: [salazarismo](https://dev.to/salazarismo)
> **Tags**: `architecture`, `webdev`, `distributedsystems`, `nestjs`
>
> This article informed the separation of conflicts from retryable failures, stable retry identities and bounded retry attempts. It is supporting practitioner guidance, not evidence of a community-wide consensus. The implementation's behaviour is verified independently by the tests above.
>
> 🔗 [Read Full Discussion](https://dev.to/salazarismo/the-hidden-problems-of-offline-first-sync-idempotency-retry-storms-and-dead-letters-1no8)
