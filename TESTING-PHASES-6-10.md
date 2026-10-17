# Phase 6–10 verification

Historical verification on 17 October 2026 (Asia/Calcutta). That delivery ended at Phase 10, with the supplied logo and Seva-inspired UI. The current scope and results are in [Phase 11–14 verification](TESTING-PHASES-11-14.md).

For the subsequent complete interface translations and compact laptop layout, see [localization and layout verification](TESTING-LOCALIZATION-LAYOUT.md).

## Results

| Check                                    | Observed result                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm test` — API                         | **27 passed, 0 failed, 0 skipped**: original 14 regression checks plus 13 assessor/evidence/scoring checks, using real MongoDB |
| `npm test` — React                       | **1 complete workflow passed**, using real React controls, Express and MongoDB in an isolated JSDOM environment                |
| `npm run build`                          | Server TypeScript compilation and React/Vite production build passed                                                           |
| `npm audit`                              | **0 vulnerabilities** reported                                                                                                 |
| `npm run test:live-assessment -w server` | Real Cloudinary upload and Gemini skill/image analysis passed, followed by saved sign-off and worker result retrieval          |
| Frontend bundle boundary                 | No `GEMINI_API_KEY`, `CLOUDINARY_API_SECRET`, Gemini service endpoint or `correctAnswer` property found in the built client    |
| Browser visual QA                        | **Unverified**: automatic localhost inspection was rejected by browser policy, and a user-shared tab was unavailable           |

The assessor module is emitted as a separate production chunk (approximately 32.7 kB, 9.5 kB gzip), keeping it out of the initial worker bundle. Existing Phase 1–5 screenshots are historical and do not depict the current redesign.

## API coverage

The original registration, authentication, worker isolation, experience, AI/manual skills, qualification matching, scoring and persistence tests remain passing. New tests verify:

1. Assessor-only dashboard/candidate reads from stored worker records.
2. Exclusive assessment claiming and protection against other assessors reading/editing assigned work.
3. Weighted practical scores, partial drafts, zero scores and saved remarks.
4. Stale versions, duplicate criteria and out-of-range scores.
5. Image decoding, upload, authenticated content retrieval and stable retry IDs.
6. Wrong file types, corrupt/forged images, oversize input and missing Cloudinary configuration.
7. EXIF removal and decoded-pixel limits.
8. AI observation schema validation, eight criterion observations, normalized scores, ownership and evidence association.
9. Missing/malformed AI producing a visible manual path rather than invented observations.
10. Required complete rubric, evidence, confirmation and justification before sign-off.
11. Human override persistence, calculated overall score, recommendation/history and HTTP 423 edit locking.
12. Manual sign-off with no AI result, plus recommendation and discrepancy threshold boundaries.
13. Concurrent evidence-upload conflict compensation that removes only the newly created test asset/record.

## React workflow

`client/test/workflow.test.tsx` renders the actual application and drives its accessible controls through:

1. New worker registration, language, trade and experience selection.
2. Description analysis, skill confirmation and qualification matching.
3. All five quiz questions, review, submission and stored **100%** self-assessment.
4. Sign-out, assessor entry, demo assessor login and worker selection.
5. Assessment claim, all eight rubric scores and saving the **100%** raw rubric total.
6. Image selection/upload and saved **40%** AI suggestion.
7. Human practical score **90%**, an explanatory override reason and explicit confirmation.
8. Final score **93%**, locked practical controls, and MongoDB verification of the signed-off record.
9. Worker login and recovery of the same **93%** result, then a fresh React mount restoring it from the saved session and API.

This test uses real Express/MongoDB and controlled Gemini/Cloudinary transports. It checks behavior, accessible control labels and persistence. JSDOM does not render layout, inspect responsive sizing, exercise microphone capture or establish visual similarity to screenshots. An initial test failure revealed joined score/description accessible names; explicit radio labels now separate the score and description. The final combined suite passes.

## Live provider workflow

The opt-in live test used an isolated local test database and the configured credentials from `server/.env`. It submitted a synthetic electrician description and the clearly labelled [synthetic switchboard illustration](docs/fixtures/synthetic-switchboard.png). No real worker photograph or outcome was submitted.

- Gemini returned residential wiring, MCB installation, switch installation and fault diagnosis skills.
- The worker self-assessment persisted at **100%**.
- Cloudinary accepted the private normalized image, and authenticated API preview retrieval succeeded.
- Gemini returned **eight** criterion observations, warnings/limitations and a normalized **0%** suggestion for the synthetic illustration. This tests transport and structured processing, not evidence of model accuracy on real electrical work.
- A deliberately explained test override approved **90%** practical, producing **93%** overall and `SIGNED_OFF` status.
- Subsequent practical editing returned **423**; the worker endpoint returned the stored **93%** result.
- Cleanup removed only the cloud asset created by that test and its exact generated test database.

Regular tests and the React test use unique `dakshsetu_test_<uuid>` databases on local MongoDB port 27027. The application’s configured remote MongoDB connection was separately confirmed during development startup. No tests reset the development database, and existing worker results were preserved.

## UI and branding checks

The external design reference was inspected for its font family, heading sizes and colors. The implemented theme uses Segoe UI/system fallbacks, 42 px page headings and 38 px section headings at desktop base sizes, navy headings, orange actions, pale sections, broad cards and a two-row masthead/navigation. Assessor tables, score choices, upload controls and layouts have responsive CSS rules.

The user’s supplied transparent PNG is copied unchanged to `client/public/dakshsetu-logo.png`. Header/footer frames hide its transparent outer margin with CSS. The same file is the favicon; the exact requested tagline appears in branding, metadata and documentation.

The updated layout and logo placement still need a real browser visual review. Browser policy denied localhost inspection; no alternate browser/control surface was used to bypass the restriction. The successful React test does not replace visual QA. Speech capture and audible synthesis remain untested device/browser-dependent features.

## Community Wisdom

### 🌐 Community Wisdom: [Resize and strip EXIF metadata from user uploads in Node.js](https://dev.to/purlo/resize-and-strip-exif-metadata-from-user-uploads-in-nodejs-f5m)

> **Source**: [purlo](https://dev.to/purlo)
> **Tags**: `node`, `javascript`, `webdev`, `security`
>
> The article’s discussion of decoded image size and EXIF stripping informed the bounded, normalized upload path. A commenter also recommended checking MIME/signatures and private metadata. These are supporting observations from one article and its discussion, not a community-wide consensus. The implementation additionally avoids arbitrary image-URL fetching.
>
> 🔗 [Read Full Discussion](https://dev.to/purlo/resize-and-strip-exif-metadata-from-user-uploads-in-nodejs-f5m)
