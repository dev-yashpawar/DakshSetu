# DakshSetu practical workflow upgrade

Implemented in the existing application on 17 October 2026. The navy, orange and white design, authentication, existing page URLs, three languages and human sign-off remain in place.

## Resulting workflow

Assigned assessor creates a practical task → worker records or uploads evidence → worker submits and locks the evidence → automatic AI first review → assessor reviews timestamped observations and scores the standard rubric → human recommendation and sign-off → locked assessment and Skill Passport.

Existing assessments without an assigned task retain their previous workflow. No database reset or destructive migration is required.

## Files changed

| Area | Files |
| --- | --- |
| Shared contracts and privacy | `shared/practical.ts` (new), `shared/types.ts`, `shared/advanced.ts` |
| Task workflow and background review | `server/src/practical.ts` (new), `server/src/app.ts`, `server/src/index.ts` |
| Evidence and AI | `server/src/media.ts`, `server/src/evidence.ts`, `server/src/video.ts`, `server/src/models.ts` |
| Human scoring and oversight | `server/src/assessor.ts`, `server/src/sync.ts`, `server/src/management.ts` |
| Passport and verification | `server/src/credentials.ts`, `server/src/passport-pdf.ts`, `client/src/pages/Verify.tsx` |
| Worker and assessor UI | `client/src/components/PracticalTask.tsx` (new), `client/src/components/VideoReview.tsx`, `client/src/pages/Assessor.tsx`, `client/src/pages/WorkerPortal.tsx`, `client/src/components/PortalNavigation.tsx`, `client/src/components/WorkerOutcome.tsx` |
| Administration and offline | `client/src/pages/Admin.tsx`, `client/src/services/offline.ts` |
| Voice input | `client/src/services/speech.ts` (new), `client/src/pages/Worker.tsx`, `client/src/components/VoiceNote.tsx` |
| Success feedback and styling | `client/src/components/SuccessFeedback.tsx` (new), `client/src/services/feedback.ts` (new), `client/src/services/api.ts`, `client/src/App.tsx`, `client/src/styles.css`, `client/src/portal.css` |
| Translation | `client/src/locales/practical.ts` and `register-practical.ts` (new), `client/src/locales/messages.ts`, `client/src/localization.ts` |
| Tests and configuration | New practical backend/UI tests, speech and feedback tests; updated localization, login and upload tests; `server/scripts/live-practical-review.ts` (new); `server/.env.production.example` |

No dependency was added or removed; package locks are unchanged.

## Database additions

- Assessment: optional `practicalTask` and `practicalWorkflow`, including task/version identity, instructions, assignment time, optional due date, submission snapshot, AI job status, lease and review timestamps. Existing rubric/qualification snapshots and history are reused.
- Evidence: task/candidate/uploader identity and video duration. Uploaded bytes remain private; draft removal unlinks evidence without discarding the audit record.
- AI observations: validated timestamp, readable timestamp label, observation type and optional criterion-level suggested scores. Existing AI analysis and audit collections are reused.
- Reassigning an unsigned task requires a reason, archives prior task, scores, workflow and evidence references in audit metadata, and starts a fresh task submission. Signed-off records remain locked.

## Pages and API routes

No frontend route was removed or renamed. Worker evidence is at `/worker/evidence`; existing assessor candidate pages, administration, passport and `/verify/:credentialId` routes are extended.

New API endpoints:

| Method | Endpoint | Access / behavior |
| --- | --- | --- |
| GET | `/api/practical/:id` | Own worker, assigned assessor or admin; safe task/evidence metadata |
| POST | `/api/practical/:id/assign` | Assigned assessor; versioned task creation/reassignment |
| POST | `/api/practical/:id/submit` | Own worker; video required; snapshot and lock; queue AI review |
| POST | `/api/practical/:id/ai-review` | Assigned assessor; retry a failed AI review |
| DELETE | `/api/practical/:id/evidence/:evidenceId` | Own worker; unlink editable draft evidence |
| POST | `/api/practical/:id/review-start` | Assigned assessor; record review start |

Existing authenticated media, practical-score, finalize, passport PDF, public credential verification and admin revocation endpoints are reused. API base URL configuration remains centralized and unchanged.

## AI video review and timestamps

Submission queues a durable job in MongoDB. A five-second poll claims one job using an atomic five-minute lease, allowing recovery after a process restart. FFmpeg samples eight explicit positions, including the opening and near the end of a supported clip. Gemini receives these frames, their actual times, the task and frozen qualification/rubric context.

Responses must contain valid rubric IDs, bounded confidence/scores and timestamps matching sampled frames. Invalid output, missing runtimes, provider errors or timeouts expose: **“AI review unavailable. Continue with manual assessor review.”** A failed review does not prevent the assigned human assessor from scoring and completing the case.

The authenticated video player has clickable timestamp observations. Clicking sets the video's `currentTime`; a pending seek is applied after metadata loads. Positions are clamped to the available duration. Worker pages do not receive internal AI suggestions or provisional assessor scores.

This is frame-based visual assistance. It does not inspect every frame, transcribe audio, establish identity or prove authenticity. Confidence and limitations remain visible to the assessor.

## Human scoring and Skill Passport

The assessor uses the existing standardized 0–3 rubric, remarks, evidence references and mandatory safety checks. The interface shows criterion-level AI suggestions separately. A disagreement with AI, including differing criteria with the same aggregate score, requires an override reason at sign-off. Only an authorized human can finalize the recommendation.

Finalization locks the record and reuses existing Skill Passport/credential creation. The PDF adds the assessment identifier and issue date and uses the heading **Assessor-Verified Competency Profile**. It retains verified skills, gaps, qualification, assessor information and the existing QR code. PDF download is audited. Public QR verification shows safe credential status and qualification information; revocation is reflected by the verification endpoint. Private evidence and AI observations are excluded.

Signed-off assessments cannot be reopened in place. Existing targeted reassessment is the correction path and preserves the original outcome. The application remains clearly labelled as a research prototype, with no government affiliation or official certification claim.

## Security and offline behavior

- Server-side ownership and assigned-assessor checks apply to task, upload, content access, scoring and sign-off.
- Task identity and optimistic versions prevent stale uploads/scores from modifying a reassigned task. Submission and finalization locks are enforced on the server.
- Workers receive redacted assessment responses, including cached/sync receipts. Storage credentials, provider secrets and private evidence are not exposed publicly.
- Video MIME/container validation, byte limits, decoder limits and bounded temporary processing are retained. Prompt identifiers and audit records support basic evidence integrity; they do not guarantee authenticity.
- Previously opened task data and existing quiz/practical drafts remain available offline. Queued media retains the task ID; stale-task uploads become reviewable conflicts. Upload, AI review, final submission and sign-off require a connection. Reconnection sync keeps the existing retry/conflict behavior.

## Microphone and small UI fixes

Experience capture and assessor voice remarks now share a continuous recognition controller. It shows interim text, restarts after normal browser session endings or silence, deduplicates finalized text and preserves interim words when stopping. Permission, microphone, language and network failures have separate translated messages. Network retries are bounded. Explicit Stop, route exit, language changes and unmount cancel listening/restarts. A session pauses after two minutes with a clear restart message.

Successful form mutations and completed synchronization show a brief, non-blocking checkmark. Failed requests do not show success. The live region supports screen readers and reduced-motion settings. Native checkboxes are fixed at 18 × 18 pixels and radio controls at 16 × 16, without reducing the surrounding label's clickable area.

## Verification

Full regression results for the practical-workflow delivery (before the recorded-audio follow-up below):

| Check | Result |
| --- | --- |
| Backend suite | **57 passed**, zero failed/skipped |
| Frontend suite | **23 passed**, zero failed/skipped |
| Localization | 51 routes/states in Hindi and Marathi, live switching, fallback/error copy and canonical form values |
| Server production build | Passed (`tsc`) |
| Client production build | Passed (`tsc --noEmit && vite build`) |
| Offline shell | Passed; 32 static assets including lazy chunks; private API/POST/cross-origin requests excluded |
| Bundle regression guard | Passed; initial static JS 697,623 bytes, 200,900 gzip; largest/entry chunk 434,240 bytes |
| Git whitespace check | Passed; existing Windows line-ending notices only |

Logs are in ignored local files `output/backend-final-test.log`, `output/frontend-final-test.log` and `output/final-build.log`. The new practical integration tests exercise assignment, ownership, submission locking, eight-frame AI response validation, worker redaction, score overrides, video-only sign-off, PDF/verification/revocation, provider failure and expired job recovery. Test responses are explicitly synthetic.

A separate live-provider check uploaded a generated test clip to authenticated Cloudinary storage, obtained a real Gemini response with eight sampled frames and twelve criterion suggestions, validated timestamps and removed the test storage asset. No genuine worker footage was used for this provider check.

Real browser checks cover laptop/mobile layout, Marathi task copy, 18-pixel checkbox sizing, successful form feedback and uploading/submitting a synthetic test video. The browser submission completed a real Gemini review, and the assessor page displayed the synthetic test pattern, honest “not visible” observations and clickable timestamps. A separate component test verifies seeking to a nonzero 42-second position. Screenshots are in `output/screenshots/`. Automated speech tests exercise the browser recognition lifecycle; physical microphone recording and the browser vendor's recognition service require a person speaking on that device and have not been claimed as verified.

## Deployment steps and remaining limits

1. Redeploy both frontend and backend from this updated source; no remote deployment was performed.
2. Keep Vercel root `client`, build `npm run build`, output `dist`, existing SPA rewrites, and `VITE_API_BASE_URL=https://dakshsetu-api.onrender.com`.
3. Keep Render root `server`, Node 22, build `npm install --include=dev && npm run build`, start `npm start`. Retain existing MongoDB, JWT, Gemini, Cloudinary, CORS/client URL and public frontend URL environment settings. Keep secrets only on the backend.
4. Install FFmpeg and ffprobe in the production backend environment. The existing repository-root Dockerfile includes them. With native Node hosting, provide executable paths using `FFMPEG_PATH` and `FFPROBE_PATH` or ensure they are on PATH. Missing runtimes produce the honest manual-review fallback.
5. Optional `MAX_VIDEO_MB=10` controls the bounded upload limit, clamped to 1–10 MB. Analysis supports MP4/WebM clips up to 60 seconds and 1080p. Large/long recordings need a separate streaming/storage architecture; this upgrade deliberately retains the current bounded media design.
6. DigiLocker remains the explicitly labelled mock requested earlier. Synthetic consistency data remains labelled as demo data. Neither is represented as an approved integration or real assessor study.

## Recorded-audio follow-up: browser speech service connection failure

The browser's Web Speech service can fail with a network error even when microphone access succeeds. Retrying that browser service cannot establish a connection when it is unavailable. The experience form now switches to recorded audio after connection/language/recognition failures; users can also select **Record audio instead** immediately. Assessor voice remarks use the same fallback.

New files: `client/src/components/RecordedVoice.tsx`, `server/src/voice.ts`, `server/test/voice.test.ts`, `client/test/recorded-voice.test.tsx`. The existing worker/assessor voice controls, translations, portal styles and app route registration are extended.

The fallback uses the browser's MediaRecorder to record for up to two minutes, independently of SpeechRecognition. It previews audio locally and offers a download. Audio is sent to the existing Gemini backend only after the user selects **Transcribe audio**. An authenticated multipart endpoint, `POST /api/voice/transcribe`, accepts worker/assessor requests, validates supported container/MIME headers and a 5 MB limit, bounds provider execution, rate-limits requests and returns a validated transcript. Raw audio is not saved to evidence, MongoDB or application logs. The user reviews the editable transcript before the normal experience submission. The existing `GEMINI_API_KEY`/`GEMINI_MODEL` are reused; FFmpeg and new dependencies are not required for voice transcription.

Provider failure retains the recording on the open page for retry/download. Recordings are not persisted across page refreshes. Silence and invalid/provider output are explicit errors, with no invented fallback text. Leaving the component cancels requests and releases microphone tracks. Both old browser recognition and the new recorded path remain optional; typing remains available.

Verification: three new backend tests passed for authorization, valid transcripts, forged/oversized recordings, provider errors, silence and output validation. Seven targeted frontend tests passed, including translation across 51 routes/states in both Hindi and Marathi, recognition lifecycle and recording/preview/failure/retry. The existing full worker-to-assessor React workflow passed again alongside the recording test. Server and client builds passed. A generated Windows speech sample was transcribed successfully through the live authenticated local API and Gemini, then through the real browser form; the expected sentence appeared in the experience textarea. This verifies the actual transcription path using synthetic speech, without capturing personal microphone audio.

Deploy both updated applications to enable this endpoint in production. No additional environment variable is required. Sources: [MDN speech recognition errors](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error) and [Gemini audio input/transcription](https://ai.google.dev/gemini-api/docs/generate-content/audio).

Community research: [How to Build a Reliable Long-Form Transcription Pipeline](https://dev.to/hanna_altunina/how-to-build-a-reliable-long-form-transcription-pipeline-59l0), by [hanna_altunina](https://dev.to/hanna_altunina) (AI, architecture, web development, audio), emphasizes explicit failure states and preserving recoverable media. This short-recording fallback applies those principles without introducing a long-form job pipeline. The retrieved article had no comments; this is one practitioner's account.

## Community Wisdom

The DEV practitioner article [Building a Review Manifest for AI-Assisted Short-Video Exports](https://dev.to/physicsai/building-a-review-manifest-for-ai-assisted-short-video-exports-1825), by physicsai (AI, web development, productivity and tooling), describes binding approval to an exact media artifact/version. The task IDs, immutable submission snapshots and version checks here apply that useful principle. This is one implementation account, not evidence of community consensus or assessment validity.
