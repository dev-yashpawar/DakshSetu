# Deploy DakshSetu

This release serves the React site and Express API together from one service. Hosting is left to you; nothing has been published or billed. DigiLocker remains an explicitly labelled demo, not an approved integration. Demo login and account seeding are disabled in production by default.

## 1. Upload the source

Use this project folder in a private Git repository, or extract `output/dakshsetu-deploy.tar.gz` into an empty folder and upload that source. The archive excludes actual `.env` files, local databases, uploaded media, logs, node_modules, generated builds and Windows FFmpeg binaries. Install/build on the deployment machine; do not upload Windows node_modules to Linux.

Do not upload `server/.env`, `server/data`, `.tools`, `node_modules` or `output`. Only example environment files belong in the source repository. Keep the generated archive private as project source.

## 2. Set server environment variables

Use `server/.env.production.example` as the list of settings. Put actual values in the hosting environment, never a `VITE_*` variable or the Dockerfile.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | Host-provided port, or `4000` on your server |
| `MONGODB_URI` | Your production MongoDB database connection string |
| `JWT_SECRET` | Generate a new random secret, at least 32 characters; retain it across restarts |
| `PUBLIC_APP_URL` | Your final HTTPS origin, e.g. `https://dakshsetu.example.com`; no route or query |
| `CLIENT_URL` | The same HTTPS origin; comma-separated origins only if deliberately needed |
| `TRUST_PROXY` | `1` on Render (one reverse proxy), `0` for direct access |
| `GEMINI_API_KEY` | Your server-side Gemini key |
| `GEMINI_MODEL` | `gemini-2.5-flash`, or the model supported by your account |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Your private media storage settings; provide all three |
| `SEED_DEMO`, `ALLOW_DEMO_LOGIN` | `false` |

Generate a JWT secret locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and put it directly into the host's secret settings. Do not send it in chat. Use a production MongoDB database and allow the host to connect through your database network rules; preserve backups before moving real records.

Full AI/media functionality needs Gemini and all Cloudinary credentials. Without Gemini, the existing manual extraction fallback remains available. If all Cloudinary fields are empty, the app can start but media upload is unavailable; partial Cloudinary settings fail startup. Existing local development keys are not included in the release archive.

## 3. Deploy one service

### Render with the supplied Blueprint

1. Push the source to your repository.
2. In Render, create a Blueprint from `render.yaml`, or create one Web Service with **Docker** runtime and the repository-root `Dockerfile`.
3. Enter the secret settings and final public origin from the table above. The Blueprint generates `JWT_SECRET` for a new service; do not replace a working secret on each deploy.
4. Use health path `/api/health`. No separate frontend service or Vite dev server is needed. The image's CMD starts the compiled API and serves the built site.
5. Deploy manually. The supplied Blueprint disables automatic deployment. Point your custom domain to the host and enable HTTPS if using one.

The template uses the official [Docker runtime](https://render.com/docs/docker) and [Blueprint Docker fields](https://render.com/docs/blueprint-spec). It does not create a database or hosting account. Render supplies the runtime port. The image includes FFmpeg/FFprobe, runs as the `node` user and has a health check.

### Docker on your own host

Create an ignored `server/.env.production` with the runtime values above. From the project root:

```sh
docker build -t dakshsetu:release .
docker run -d --name dakshsetu --restart unless-stopped --env-file server/.env.production -p 4000:4000 dakshsetu:release
```

Put your HTTPS reverse proxy in front of port 4000. Set trust proxy to match your actual topology. The app stores records in MongoDB and private evidence in Cloudinary; local container storage is not the evidence database. Video decoding uses bounded temporary files under `/tmp`.

### Node host without Docker

Use Node.js 22 or newer supported by your host. Install FFmpeg and FFprobe through the operating system package manager and make them available on PATH, or set `FFMPEG_PATH` and `FFPROBE_PATH`. The Windows `setup:video` helper is not for Linux deployment.

```sh
npm ci --include=dev
npm run build
npm prune --omit=dev
npm start
```

Set the production environment before startup. The build needs development dependencies, even when the eventual server runs in production. A native Render service can use `npm ci --include=dev && npm run build` and `npm start`, but FFmpeg availability must be arranged separately; the supplied Docker template includes it.

## 4. Initialize qualification data and the first administrator

Run **once** in your hosting service shell, with the production MongoDB environment available:

```sh
npm run seed:qualifications -w server
```

This inserts the existing prototype electrician qualification without creating or replacing users. It remains demo qualification data; replace/version it through the admin portal only when you have the verified official material.

Temporarily set `BOOTSTRAP_ROLE=admin`, `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PHONE` and a unique `BOOTSTRAP_PASSWORD` (12–72 characters, at most 72 UTF-8 bytes) in the host's private environment. Then run:

```sh
npm run bootstrap-user -w server
```

Existing accounts/passwords are not overwritten. Remove the `BOOTSTRAP_*` environment values afterward. Sign in at `/login/admin`; use User management to create assessor accounts. Workers register at `/register`. Do not run the ordinary demo seed command on production.

Docker shell equivalent: `docker exec dakshsetu npm run seed:qualifications -w server`. For bootstrap, inject the temporary private environment through your host's secret mechanism; never put passwords in command arguments or image layers.

## 5. Check the deployed service

- `/api/health` reports a connected database; a disconnected database returns HTTP 503.
- Open `/`, `/login/worker`, `/login/assessor`, `/login/admin`, `/register` and `/help` over HTTPS. Refresh a nested route to check SPA routing.
- Log in as the new admin, create an assessor and verify role protection. Published demo credentials and the DigiLocker mock must be rejected.
- With a test worker, complete the assessment, upload an image/video, review AI observations, sign off as the assigned assessor and download the Passport. Check its QR points to the final public domain. Use test records deliberately; this step writes data.
- Check mobile/laptop layout, language switching, microphone permissions, reconnect sync and PDF printing in your browser. Offline features and microphone permissions need HTTPS (or loopback during local testing).
- Keep the previous source/image version and database backup for rollback. Avoid resetting the database during redeployment.

## Verification and limits

Verified for this release: production build; production-configuration regression (missing/invalid origin, secret, database, port, proxy and partial storage cases); compiled API/SPA production smoke; bundle guard; 27-asset offline shell; and source archive inventory/checksum. The production dependency audit reported **zero known vulnerabilities** at this check. The packaged source was checked against the configured local secret values and none were present. Earlier unchanged page verification passed 91 live checks and 14 UI tests; earlier backend verification passed 53 tests. These are layered checks, not a claim of a new combined test run. No public deployment was performed.

Docker CLI is installed here, but its Linux engine is stopped (`dockerDesktopLinuxEngine` pipe unavailable). Therefore the container image was not built/run locally. Browser runtime startup is also unavailable; no new visual browser validation is claimed. Compiled production API/SPA smoke tests use an isolated local MongoDB database and do not reset your application database. Target-host Docker build, HTTPS/domain and real-device checks remain yours after publishing.

### 🌐 Community Wisdom: [Your AI Agent Dockerfile Might Be Leaking Secrets](https://dev.to/raju_dandigam/your-ai-agent-dockerfile-might-be-leaking-secrets-2cei)

> **Source:** [raju_dandigam](https://dev.to/raju_dandigam) · **Tags:** `docker`, `security`, `node`
>
> Runtime provider credentials belong in the host's secret environment, not Docker build arguments or image layers. This informed the restricted source archive and runtime-only credentials. No substantive comments were available; this is practitioner guidance, not a security certification.
>
> [Read Full Discussion](https://dev.to/raju_dandigam/your-ai-agent-dockerfile-might-be-leaking-secrets-2cei)
