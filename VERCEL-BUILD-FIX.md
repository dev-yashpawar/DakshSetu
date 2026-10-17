# Vercel client build fix

## Cause and changes

The old client build ran TypeScript and Vite through hard-coded `../node_modules` executable paths. Vercel may install them under `client/node_modules`, so that path was invalid. TypeScript was also declared only at the workspace root instead of directly in the frontend's development dependencies.

- `client/package.json`: build is now `tsc --noEmit && vite build`; added `typescript: ~5.9.3`. Existing Vite, React plugin and all other working dependencies remain. `dev` and `preview` already use package binaries; no client script contains a parent `node_modules` path.
- `package-lock.json`: updated the client workspace's direct TypeScript dependency using npm from `client`. Keep this existing workspace lockfile; a second client lockfile was not introduced.
- `client/tsconfig.json`: retained `../shared` and added a client-local Zod lookup for shared validation. Normal resolution still supports the existing hoisted workspace installation.
- `client/vite.config.ts`: deduplicates Zod to the client's dependency resolution root. The existing plugins, chunking and development proxies remain unchanged.
- `VERCEL-BUILD-FIX.md`: this handoff.

No frontend application source, backend source, shared logic, environment-variable names, UI or React routes were modified.

## Shared code is required

The frontend is not a physically self-contained `client/` source folder. Deploy the repository with **Root Directory = client**, while allowing Vercel to read the sibling shared source. This does not deploy the Express backend as a Vercel server.

| Shared module | Frontend consumers |
|---|---|
| `shared/validation.ts` | `Auth.tsx`, `Worker.tsx`; uses Zod and shared assessment constants |
| `shared/assessment.ts` | Admin, assessor, quality and reassessment screens |
| `shared/consistency.ts` | Quality/consistency screen |
| `shared/qualification-reference.ts` | About/help information screen |
| `shared/types.ts`, `shared/advanced.ts` | Type-only imports across worker/assessor/Passport screens, components, session, localization and offline storage |

The clean client-only dependency install initially reproduced `TS2307: Cannot find module 'zod'` from `shared/validation.ts`: resolution starts from the shared file, whose ancestors do not include `client/node_modules`. The TypeScript lookup and Vite deduplication fix that case without moving or duplicating shared logic. Vite's normal `/node_modules/` chunk-matching regex is not an executable path and was retained.

Uploading only the physical `client` folder without `shared` cannot work with these existing imports. Keep the sibling folder in the repository and enable the supported outside-root source option. See [Vercel's monorepo guidance](https://vercel.com/docs/monorepos/monorepo-faq) and [Vite dependency deduplication](https://vite.dev/config/shared-options#resolve-dedupe).

## Vercel settings

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework Preset | `Vite` |
| Install Command | `npm install --include=dev` (or automatic npm workspace installation with development dependencies included) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | `22.x` |
| Include source files outside of the Root Directory in the Build Step | **Enabled** |

Redeploy the changed source; clear the old build cache for the first retry. Keep your existing routing/rewrite configuration. React route definitions are untouched by this fix.

For a separately hosted backend, keep the existing `VITE_API_BASE_URL` mechanism: set it in Vercel to your backend's HTTPS API base, e.g. `https://your-backend.example/api`, before building. The development `/api` proxy in Vite is a development-only setting. The backend's permitted client origin must include your Vercel frontend origin. Existing variable usage is unchanged; backend hosting and secrets do not belong in the frontend deployment.

## Verified

1. In the actual repository: `cd client`, `npm install`, `npm run build` — passed.
2. In a fresh directory outside the checkout: copied only frontend build sources plus sibling `shared`, with no repository-root package, node_modules or server. `cd client`, `npm install --include=dev`, `npm run build` — passed with dependencies installed under that client's node_modules.
3. Both builds produce the same JavaScript/CSS asset names and contents. The test verifies build/module resolution; it is not a new browser or live Vercel deployment test.

Logs: ignored `server/data/vercel-client-install.log`, `vercel-client-build.log`, `vercel-clean-install.log`, `vercel-clean-build.log`.

### 🌐 Community Wisdom: [A gentle intro to npm workspaces, with visuals](https://dev.to/wasp/a-gentle-intro-to-npm-workspaces-with-visuals-4jpn)

> **Source:** [wasp](https://dev.to/wasp) · **Tags:** `javascript`, `node`, `npm`
>
> Workspace hoisting can make imports work locally while a different dependency layout exposes missing resolution. This informed the clean client-local install test. Comments praised the explanation; no technical counterarguments were present. This is one practitioner explanation, not consensus evidence.
>
> [Read Full Discussion](https://dev.to/wasp/a-gentle-intro-to-npm-workspaces-with-visuals-4jpn)
