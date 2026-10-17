# Vercel direct-link and refresh fix

Created `client/vercel.json` because none existed. With Vercel Root Directory set to `client`, the deployment reads this configuration:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

The app uses React Router's BrowserRouter. That remains unchanged; no HashRouter, redirects, React route definitions, UI, page components, authentication or backend API behavior were modified. This is the standard [Vercel Vite SPA fallback](https://vercel.com/docs/frameworks/frontend/vite). Existing built asset files continue to be served as files rather than client routes. Vite's build output and environment-variable handling are unchanged.

## API configuration

The existing Axios client in `client/src/services/api.ts` reads **VITE_API_BASE_URL**, with `/api` as the local same-origin fallback. It does **not** read VITE_API_URL. In Vercel's environment settings, set the existing variable to the real Render backend's HTTPS API base, including `/api`:

```dotenv
VITE_API_BASE_URL=https://dakshsetu-api.onrender.com/api
```

Use that hostname only if it is your actual Render service URL; otherwise substitute the correct one. This public frontend setting contains no secret. Build/redeploy after setting it. Absolute requests to the Render origin are not intercepted by a Vercel same-origin rewrite. An unset variable still falls back to `/api`, which is not a hosted Express API on this frontend-only deployment. The backend should continue allowing `https://daksh-setu-five.vercel.app` through CLIENT_URL. No API proxy or new environment name was added.

## Route findings

| Requested path | Existing app behavior after SPA delivery |
|---|---|
| `/login/assessor`, `/login/worker`, `/login/admin` | Defined login pages |
| `/worker/dashboard` | Defined protected worker dashboard; signed-out users go to worker login |
| `/admin/dashboard` | Matches `/admin/:section?` with section `dashboard`; existing protected admin dashboard |
| `/assessor/dashboard` | **Not a defined React route.** The existing assessor dashboard is `/assessor`. This path will reach the app's Page not found view rather than Vercel's 404. No alias was added, to preserve the requested route structure. |
| `/verify/test-id` | Matches `/verify/:credentialId`. A nonexistent credential can correctly show an invalid/not-found verification result; the backend may return its expected credential 404. This differs from a Vercel missing-page error. |

## Validation and deployment

- `cd client` then `npm run build` passes, producing `dist/index.html` and the expected asset files.
- Parsed JSON exactly matches the requested rule; the rule covers all seven listed URLs.
- Local Vite production preview served the SPA for initial and repeated HTTP requests to all seven URLs. JavaScript/CSS and both logos returned their own non-HTML responses. These are HTTP delivery checks, not browser rendering or a Vercel runtime emulator.
- Logs: ignored `server/data/vercel-spa-build.log`, `vercel-spa-local-check.json`.
- Live Vercel pages could not be fetched through the web tool; no post-deployment browser/refresh success is claimed. The changed configuration is local until you deploy it.

Push/upload the updated source and **redeploy Vercel**. Keep Root Directory `client`, preset Vite, Build Command `npm run build`, Output Directory `dist`, and outside-root shared sources enabled as described in VERCEL-BUILD-FIX.md. Ensure the deployment contains this client/vercel.json and the correct API base environment setting. Then directly open and refresh each valid route. Also test the canonical assessor route `/assessor`.

Other changed files: `scripts/package-deploy.mjs` now includes client/vercel.json in the existing sanitized source archive; this document records the findings. No unrelated Vercel settings existed to merge or overwrite.
