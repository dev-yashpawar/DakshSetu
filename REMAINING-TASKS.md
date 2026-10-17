# Remaining-task completion — 17 October 2026

**Current operational-portal follow-up:** [PORTAL-COMPLETION.md](PORTAL-COMPLETION.md). The former read-only admin gap is now addressed; historical test counts and bundle sizes below describe the earlier checkpoint.

This follow-up handles locally actionable audit items. Hosting remains manual. Real assessor ratings were not provided and the dashboard stays in honest no-data mode unless the user chooses the labelled synthetic demo or imports ratings.

## Completed changes

- **Real video runtime and validation:** installed project-local FFmpeg/FFprobe 9.0.2 from the Windows build provider linked by [FFmpeg’s download page](https://ffmpeg.org/download.html). The helper verifies SHA-256 `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`, retains the licence, changes neither system PATH nor secrets, and keeps binaries/archive in ignored `.tools`. `npm run setup:video` repeats setup on Windows x64; Linux hosting needs both native tools separately.
- **Sampling bug fixed:** real decoding exposed failed near-EOF seeks and an MJPEG colour-format requirement. Sampling now uses one bounded decoder pass, six uniformly resampled JPEGs, explicit full-range format and dimension/duration validation. Sparse clips can repeat source frames; the UI explains this and displays sample positions. Corrupt and overlong clips fail clearly. These are sampled observations, not proof of continuous actions.
- **Live video integration:** actual private Cloudinary video upload → six actual FFmpeg frames → live Gemini observations → persisted analysis/audit. The synthetic moving test pattern returned twelve criterion observations. The test removed its own cloud video and isolated database. No real worker was certified.
- **Page loading and performance:** Auth, worker/start and information pages now load by route; the framework is a reusable separate chunk. The landing page remains directly available. A localized route error boundary offers reload/home navigation without clearing saved device drafts. It recovers when navigating to another route.
- **Bundle guard:** `npm run test:bundles` checks the production manifest, keeps worker/auth/assessor/admin feature modules out of the landing page’s static import graph and rejects chunks above 500 kB. Entry chunk: **392,417 bytes** versus the previous roughly 779,170. The initial static JavaScript graph, including framework, is **655,800 bytes / 192,068 bytes gzip**. Every JavaScript chunk is below 500 kB; the warning is gone. This is a static graph measurement, not a browser load-time/Lighthouse result. The offline shell intentionally downloads all application chunks for later offline use.
- **Source provenance and truthful help:** About now links the [PSSC Electrician Domestic Solutions reference](https://psscindia.org/WriteData/QnP/Jan17/Electrician_Domestic_SolutionsQP_NEW.pdf), code PSS/Q6001, version 1.0, Level 3, reviewed July 2017 with next review July 2021. This is an older source, not confirmation of current approval. The prototype’s Level 4/demo QP is explicitly separate and existing worker scores/Passports are not rewritten. Current official approval still requires verification with the issuing body/NQR. Help now accurately covers offline media, focused reassessment, QR records and consistency/calibration.

## Files

New: `scripts/setup-video.mjs`, `scripts/test-bundles.mjs`, `server/src/video-runtime.ts`, `server/scripts/live-video.ts`, `server/test/video.test.ts`, `server/test/helpers/video.ts`, `client/src/components/RouteBoundary.tsx`, `client/test/loading.test.tsx`, `shared/qualification-reference.ts` and this report.

Updated: `App.tsx`, `Info.tsx`, `VideoReview.tsx`, advanced translations, Vite config, workflow/localization fixtures, server video/media code, package scripts, deployment/implementation/audit/worklog documentation, and Git/Docker ignore rules. No new npm dependency, secret, destructive migration or data reset is required.

The full regression also caught an older misplaced video-size assertion inside the sync fixture. It is now in the video fixture, so the complete suite actually exercises the 10 MB response. Earlier reports’ boundary-check wording should be read with this correction; final results are recorded below.

## Verification

Final results: **43 API/math/video tests + 11 React/offline/localization tests passed (54 total), zero failures or skips.** The connected React flow includes real video upload/frame decoding through the review controls, offline reload/reconnect, human sign-off, QR/PDF/share, targeted reassessment, consistency CSV/demo and calibration. Its provider transports and speech/share events are controlled; the separate live video test uses actual Cloudinary and Gemini and removes its cloud asset. The 35-route/state Hindi/Marathi check also passes.

Production build, manifest bundle guard, generated offline shell (**23 static assets**), compiled production smoke and real live video integration all passed. Logs are under ignored `server/data/remaining-*.log`. These checks do not substitute for physical browser/hardware/deployed testing.

Commands for repeatable checks:

```powershell
npm run setup:video
npm test
npm run build
npm run test:bundles
npm run test:shell
npm run test:production
# Optional real service test, using your existing server/.env:
npm run test:live-video -w server
```

Tests need the isolated local MongoDB on port 27027, as described in [ADVANCED-IMPLEMENTATION.md](ADVANCED-IMPLEMENTATION.md). No test resets the configured development/production database. `.tools` is excluded from Docker; install the matching runtime on your hosting system and restart the backend.

## Still outside local completion

1. **Presentation-device/browser checks:** physical microphone/permissions/read-aloud, mobile/zoom/assistive technology, camera QR scan, native share sheet and installed-PWA lifecycle remain manual. Browser automation was previously denied; no alternative browser path was used.
2. **Official current qualification approval:** the located PSSC source is older. Do not treat the demo map or older Level 3 reference as a current validated assessment blueprint or official issuing authority integration.
3. **Empirical improvement:** real paired independent assessor ratings are required before claiming reduced bias/variance. Synthetic metrics remain demonstration data only.
4. **Hosting:** deploy manually using [DEPLOYMENT.md](DEPLOYMENT.md), set the trusted public origin and repeat provider/CORS/offline/QR checks on HTTPS. No hosting account was used or deployment created.
5. **Production scope:** recovery/MFA, institutional identity checks, backups, monitoring, retention and large-scale media architecture remain future hardening, not silently added to the prototype.

### 🌐 Community Wisdom: [React.lazy() isn't enough — my code-split chunks were still loading on every page](https://dev.to/haider484991/reactlazy-isnt-enough-my-code-split-chunks-were-still-loading-on-every-page-94o)

> **Source**: [haider484991](https://dev.to/haider484991)
> **Tags**: `react`, `performance`, `webdev`
>
> This practitioner account distinguishes code splitting from actual loading: lazy code is requested when rendered. It informed the route boundaries and static-import guard. There were no substantive comments to compare; its reported Lighthouse results are not DakshSetu results. React’s [official lazy API](https://react.dev/reference/react/lazy) independently documents rendering-triggered loading and rejection handling.
>
> 🔗 [Read Full Discussion](https://dev.to/haider484991/reactlazy-isnt-enough-my-code-split-chunks-were-still-loading-on-every-page-94o)
