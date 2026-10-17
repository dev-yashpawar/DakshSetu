# Render backend build fix

## Root cause

The old server build directly executed `../node_modules/typescript/bin/tsc`. That assumes a particular hoisted installation layout which Render's server-root installation did not provide. TypeScript was only declared at the repository root. Both are fixed: the server now directly declares TypeScript and calls its package binary through npm.

## Files changed

- `server/package.json`: build `tsc`; direct `typescript: ~5.9.3`; Node engine `22.x`. Existing `tsx`, `@types/node`, Express/CORS/JWT/Multer/PDF/QR type packages and runtime dependencies remain. No server script references parent node_modules.
- `package-lock.json`: npm updated the server workspace's TypeScript dependency and engine metadata consistently. No second server lockfile was introduced.
- `server/tsconfig.json`: retains `rootDir: ..`, `outDir: dist`, NodeNext/ESM and `src` plus `../shared` inputs. Adds a client-independent, server-local Zod declaration lookup for sibling shared validation. No emitted runtime alias is introduced.
- `shared/package.json`: marks the existing shared source as ESM. No shared functions or logic moved or duplicated. Without the repository-root package marker in a clean install, NodeNext otherwise emitted shared files as CommonJS, which could not be imported by the compiled ESM server.
- `server/src/index.ts`: retains dynamic `process.env.PORT` and production bind `0.0.0.0`; the startup log now reports the actual bind host/port. Serves a built React site only when its index actually exists, so a backend-only deployment doesn't attempt to send a nonexistent SPA file. API routes and their middleware are unchanged.
- `render.yaml`: Node 22 backend-only service, rooted at the repository, with commands scoped to `server` and `/api/health` as health check. The existing Dockerfile remains available as a separate full-stack deployment option.
- `server/.env.production.example`: uses the supplied Vercel frontend origin for CLIENT_URL/PUBLIC_APP_URL. Secret fields stay empty.
- `scripts/server-start-smoke.mjs`: reusable test of the actual npm start command against an isolated database, with CORS, port and private-route checks.
- Deployment documentation: this report, README and the current deployment guide.

## Compiled entry and shared imports

The existing tsconfig intentionally compiles paths relative to the repository parent:

```text
server/src/index.ts       → server/dist/server/src/index.js
shared/validation.ts      → server/dist/shared/validation.js
shared/assessment.ts      → server/dist/shared/assessment.js
```

Therefore the correct scripts are:

```json
"build": "tsc",
"start": "node dist/server/src/index.js"
```

Changing start to `node dist/index.js` would be incorrect for this project. Other compiled CLI commands under `dist/server/src` remain correct. Relative `.js` imports are preserved and resolve inside dist; compiled shared modules find dependencies through the server's node_modules (or the existing workspace hoist).

Shared imports do exist: runtime modules include `validation`, `assessment`, `data`, `consistency` and `management`; `types`, `advanced` and parts of management are also imported as types. They are used by app/services, assessment, evidence, quality, sync, management, credential/PDF and model modules. These remain one source of truth in `shared/`.

## Exact Render settings

**Important:** Render documents that files outside a service's Root Directory are unavailable at build/runtime. Unlike the Vercel outside-root source option, there is no equivalent setting to make sibling shared files available here. Thus the requested `Root Directory: server` is not safe with this existing source structure. The smallest fix is to leave the service rooted at the repository, while executing its commands from `server`. See [Render monorepo documentation](https://render.com/docs/monorepo-support).

| Setting | Use |
|---|---|
| Root Directory | **Blank** (repository root); Blueprint uses `.` |
| Runtime | Node |
| Node Version | `22.x`; set `NODE_VERSION=22.x` in Render |
| Build Command | `cd server && npm install --include=dev && npm run build` |
| Start Command | `cd server && npm start` |
| Health Check Path | `/api/health` |

The server's local commands remain exactly `cd server`, `npm install --include=dev`, `npm run build`, `npm start`. No root compiler path is needed. Only backend TypeScript is compiled; the React frontend is not built or hosted by this Render service.

After saving the Root Directory and commands, redeploy with the previous build cache cleared. Do not leave the dashboard's old `server` root in place. Select Node rather than the previous Docker runtime. Node version environment selection takes precedence over package engine metadata; see [Render Node version settings](https://render.com/docs/node-version).

## Production environment

```dotenv
NODE_ENV=production
NODE_VERSION=22.x
HOST=0.0.0.0
CLIENT_URL=https://daksh-setu-five.vercel.app
PUBLIC_APP_URL=https://daksh-setu-five.vercel.app
TRUST_PROXY=1
SEED_DEMO=false
ALLOW_DEMO_LOGIN=false
```

Let Render supply `PORT`. PUBLIC_APP_URL is the public frontend origin used by the existing browser Passport/share links; it is not the API server's bind address. Set MONGODB_URI, JWT_SECRET (at least 32 characters), GEMINI_API_KEY and all three Cloudinary values privately in Render. No keys were copied into source. Production startup already rejects missing required settings, and dev-only localhost/database/temporary-secret fallbacks are not accepted as production configuration. CORS already uses CLIENT_URL; its behavior has not been changed.

Keep the frontend's existing `VITE_API_BASE_URL` set to `https://YOUR-RENDER-HOST/api` and rebuild it when that deployment value changes. No frontend env mechanism or UI was modified in this backend fix.

Native video analysis still needs FFmpeg/FFprobe on the host; the existing explicit manual-review fallback remains if those executables are unavailable. This task did not change Gemini/Cloudinary/video behavior or claim a Linux runtime installation.

## Verification

Verified: `npm install --include=dev`, `npm run build` and the actual `npm start` command from inside `server`, both in the repository and in an independent server-plus-shared copy with dependencies installed under server/node_modules. All **54 backend tests pass**. The existing full-stack production API/SPA smoke also passes. Startup smoke confirms the emitted ESM entry/shared imports, dynamic non-default PORT, production `0.0.0.0`, MongoDB health, CORS for the supplied Vercel origin, exclusion of an untrusted origin, protected API 401s, disabled demo login, and backend-only fallback without a frontend build. Checks use isolated MongoDB databases with synthetic secrets; actual user records and deployment secrets are not modified. Logs are under ignored `server/data/render-*.log`.

The independent test copy has only `server` plus sibling `shared`, no frontend, no root package.json and no repository-root node_modules. It installs dependencies under server/node_modules, compiles there, and exercises the real npm start command. It exposed both the Zod type-resolution and ESM package-scope issues before the fixes.

No Render account was modified or deployment published. Browser testing is unnecessary for this build/start configuration repair and is not claimed.

### 🌐 Community Wisdom: [A gentle intro to npm workspaces, with visuals](https://dev.to/wasp/a-gentle-intro-to-npm-workspaces-with-visuals-4jpn)

> **Source:** [wasp](https://dev.to/wasp) · **Tags:** `npm`, `node`, `javascript`
>
> Hoisting and module lookup are separate concerns; a dependency available locally through a workspace can disappear in a service-local install. This informed the clean server-local build/start test. The comments contain praise for the explanation, not technical counterarguments or independent deployment measurements.
>
> [Read Full Discussion](https://dev.to/wasp/a-gentle-intro-to-npm-workspaces-with-visuals-4jpn)
