# Localization and screen-fit verification

Historical follow-up on 17 October 2026 (Asia/Calcutta), fixing incomplete language switching and the oversized header for Phases 1–10. See [Phase 11–14 verification](TESTING-PHASES-11-14.md) for the current Passport, offline and admin scope.

## Changes

The shared translation catalog covers home-page marketing copy, the header/footer, login/registration, language selection, help/FAQ, account/not-found, every worker step, assessor dashboard/lists/detail tabs, practical rubric descriptions, notifications, input errors, recommendations and history labels. Accessible names, placeholders, read-aloud availability messages, page title and description also switch language.

Translations update through React and the session language. No DOM text replacement, external translation service or new dependency was added. Parameterized messages handle candidate summaries and counts, while dates use the selected locale. Stored notifications can switch language after they have appeared. Canonical recommendation values, IDs, form inputs and assessment scores remain unchanged.

Original names, descriptions, filenames, custom skill labels and free-form AI evidence notes remain source data, rather than being rewritten. Known qualification/skill/rubric labels and the fixed image-analysis limitation are translated. The supplied logo asset remains unchanged, including its embedded lettering; surrounding website branding and accessible text are translated.

The desktop logo width changes from **260 px to 170 px**, masthead from **180 px to 120 px**, and navigation base height from **78 px to 64 px**. Mobile uses a 148 px logo and 104 px masthead. Fluid grid columns, bounded containers, wrapping actions, shorter-height laptop spacing and Devanagari line heights keep translated content readable. Narrow layouts stack the hero columns; assessor tables scroll within their container.

## Automated verification

| Check                      | Observed result                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| API regression suite       | 27 passed, 0 failed                                                                                 |
| React tests                | Catalog coverage, 50 route/locale combinations, and the complete worker-to-assessor workflow passed |
| Final localization recheck | Both tests passed, including combined and numeric/array validation messages                         |
| Build                      | Server TypeScript and client TypeScript/Vite builds passed                                          |

`npm test` includes the 27 passing MongoDB/API regression checks, translation-catalog validation, multilingual page checks and the existing full React worker-to-assessor workflow. `npm run test:localization` runs the two localization checks independently.

The multilingual test renders **25 page states in both Hindi and Marathi** (50 route/locale combinations): home, language, login, registration, assessor login, About, Help, not-found, account, all seven worker steps, assessor dashboard/candidate/assessment/report lists, and all five candidate tabs. It checks rendered text and accessible labels for untranslated English UI copy while explicitly allowing source data and technical abbreviations.

Additional assertions cover registration validation errors, localized recommendation options retaining their canonical values, live English → Hindi switching on Home, Hindi → Marathi switching after navigation to Help, and restoring Marathi after remounting the application. The catalog test checks both translations, interpolation-parameter consistency, rubric/qualification coverage, and unlocalized JSX literals. It also verifies a stored Hindi notification can be displayed in Marathi.

The full React workflow exercises actual Express/MongoDB persistence through registration, skills, matching, self-assessment, practical scores, evidence, AI review, override, sign-off and recovering the worker result. Regular tests use controlled provider transports; the prior live Gemini/Cloudinary checks are documented in the Phase 6–10 report. No new live provider calls are needed for this UI change.

## Verification limits

JSDOM checks UI behavior and text, not rendered dimensions. The supplied screenshot guided the compact layout changes. Browser visual inspection remains unavailable because the earlier localhost-access policy restriction could not be resolved with a shared tab. Accordingly, no claim is made that the revised layout has been visually verified at specific resolutions. Microphone/speech-service behavior remains dependent on the browser and device.

## Community Wisdom

### 🌐 Community Wisdom: [Stop shipping hard-coded strings: Meet i18nGuard](https://dev.to/rmi_b83569184f2a7c0522ad/stop-shipping-hard-coded-strings-meet-i18nguard-an-i18n-linter-for-jsts-i18next-react-intl-4m8a)

> **Source**: [rmi_b83569184f2a7c0522ad](https://dev.to/rmi_b83569184f2a7c0522ad)
> **Tags**: `javascript`, `react`, `typescript`, `i18n`
>
> The article describes hard-coded text and missing locale entries as causes of partially translated interfaces. This informed the catalog and source-coverage checks. No new linter package was installed; the existing TypeScript compiler and test stack provide the checks. The retrieved discussion had no comments, so this is one supporting source.
>
> 🔗 [Read Full Discussion](https://dev.to/rmi_b83569184f2a7c0522ad/stop-shipping-hard-coded-strings-meet-i18nguard-an-i18n-linter-for-jsts-i18next-react-intl-4m8a)
