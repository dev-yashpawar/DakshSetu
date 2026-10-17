# Production API routing

## Root cause and result

The frontend already used one Axios instance, but its base URL accepted a raw environment value unchanged and fell back to `/api` when absent. A Vercel deployment without that build-time variable sent requests to the frontend, where the SPA/static hosting cannot handle POST registration. With only the Render origin configured, existing `/auth/register` calls also needed the backend's `/api` mount prefix.

`client/src/services/api.ts` still owns the client and reads `import.meta.env.VITE_API_BASE_URL` (optional access also permits the existing JSDOM tests). New `api-base.ts` normalizes either supported form:

| Environment value | Axios baseURL |
|---|---|
| `https://dakshsetu-api.onrender.com` | `https://dakshsetu-api.onrender.com/api` |
| `https://dakshsetu-api.onrender.com/api/` | `https://dakshsetu-api.onrender.com/api` |
| Missing, development | `/api` through the existing Vite development proxy |
| Missing, production | Configuration error before any network request |

Thus the existing `api.post('/auth/register', data)` goes to `https://dakshsetu-api.onrender.com/api/auth/register`. Endpoints and offline queue/cache keys do not change. Explicit `/api` remains an opt-in for the combined Docker deployment; that relative target is blocked on Vercel app domains. Absolute Vercel app URLs and invalid URL configurations are rejected. Errors use the existing UI error handling and English/Hindi/Marathi catalogs; no new screens or forms were introduced.

## Inventory

The production source has **66 direct api request call sites** plus **6 offline-client call sites**, all using the central instance. There were **0 raw fetch/direct axios calls bypassing it**, so no individual hardcoded call sites needed rewriting. One centralized base-routing fault was fixed for all consumers.

Inspected consumers include worker/assessor/admin authentication, worker declarations and Gemini extraction, practical scoring, private image/video uploads and previews, AI observations, Passport/PDF download and verification, reassessment, quality/calibration, admin management/report export, session checks, telemetry and offline replay. Evidence/PDF/video previews still use authenticated blob responses.

There are no hardcoded backend production URLs or localhost/loopback URLs in runtime `client/src`. Two loopback destinations remain intentionally in Vite's development-only `/api` and `/uploads` proxy configuration. Test files retain isolated localhost APIs and synthetic URLs; they are not shipped to browsers or pointed at real production records. The only active Axios import is in api.ts; offline.ts imports its instance type only. Provider secrets remain server-side.

Bearer-token/session-storage logic, request timeout, forms, routes, UI, backend API handlers and offline persistence are preserved. Cookie credentials were not enabled: the existing backend uses bearer tokens and does not enable credentialed-cookie CORS, so adding withCredentials=true would break cross-origin responses instead of preserving authentication.

## Files changed

- `client/src/services/api.ts`: uses normalized configuration; blocks missing/bad production targets through the existing request interceptor.
- `client/src/services/api-base.ts`: new normalization and public configuration messages.
- `client/src/locales/management.ts`: translations for the configuration errors.
- `client/.env.example`: documents development and production forms of the same existing variable.
- `client/test/api-base.test.tsx`: regression checks for origin/prefix/trailing slash/invalid configuration.
- `Dockerfile`: public VITE_API_BASE_URL build argument defaults to `/api`, preserving the optional combined frontend/API container. No secret is added as a build argument.
- `API-ROUTING-FIX.md`: this handoff. No dependency/lockfile changes were needed.

## Deployment settings required

In the Vercel project serving the failing site (`daksh-setu.vercel.app` in the supplied error), set this for **Production** and any Preview environment that needs this backend:

```dotenv
VITE_API_BASE_URL=https://dakshsetu-api.onrender.com
```

Set it in the actual project serving that domain; the earlier `daksh-setu-five.vercel.app` may be a different project/deployment. Rebuild and redeploy after updating it. Existing JavaScript cannot pick up a dashboard variable changed after its build: [Vite 6 environment documentation](https://v6.vite.dev/guide/env-and-mode).

Keep Render CLIENT_URL configured to allow the actual frontend origin. If both frontend domains are in use, the existing comma-separated setting can be `https://daksh-setu.vercel.app,https://daksh-setu-five.vercel.app`. PUBLIC_APP_URL should remain your intended frontend origin included in that list. No backend source changes are part of this fix.

After redeploying, inspect Network: registration must target `https://dakshsetu-api.onrender.com/api/auth/register`. There should be no registration/auth/evidence requests to the Vercel origin. CORS, backend availability and a valid form payload still apply independently.

## Verification

- Production build from `client` passes with the exact supplied Render origin set in VITE_API_BASE_URL; the built entry includes that value.
- Full UI suite: **16/16 pass**, including login, admin controls, offline replay, evidence, real local video decoding with controlled providers, human sign-off, Passport and reassessment.
- Latest targeted routing and localization checks: **4/4 pass**, including 51 page states in Hindi and Marathi.
- A production-transformed copy of the **actual Axios module** was tested with controlled adapters: both origin and `/api/` forms target Render correctly and preserve bearer headers; missing config, relative `/api` on Vercel, and a Vercel absolute target make **zero adapter/network calls**. No real registrations were sent to the deployed backend.
- Bundle guard passes at 699,824 initial static bytes (under the existing 700,000 budget). Generated 27-asset offline shell and its private-request exclusion checks pass.
- Source AST inventory is saved under ignored `server/data/api-routing-inventory.json`; logs are `server/data/api-routing-*.log`.

These are local build/DOM/adapter/API workflow checks. No live Vercel redeploy or browser success is claimed. Hosting remains your manual step.

### 🌐 Community Wisdom: [React App Works Locally but Not on Vercel? A Production Checklist](https://dev.to/blogs_world/react-app-works-locally-but-not-on-vercel-a-production-checklist-41lf)

> **Source:** [blogs_world](https://dev.to/blogs_world) · **Tags:** `react`, `vercel`, `vite`
>
> A successful deployment build does not establish that the correct API environment value was embedded for the intended deployment scope. This supported testing the production-transformed client, rather than only development configuration. The post discloses AI assistance and has no substantive comments; primary Vite documentation and project tests supply the technical verification.
>
> [Read Full Discussion](https://dev.to/blogs_world/react-app-works-locally-but-not-on-vercel-a-production-checklist-41lf)
