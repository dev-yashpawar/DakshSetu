# Separate role logins and DigiLocker demonstration

17 October 2026.

## Entry points

- Worker: `/login/worker`; registration remains `/register`.
- Assessor: `/login/assessor`.
- Administrator: `/login/admin`.
- `/login` continues to open worker login, with all three portal links. Old `/login?role=assessor` and `?role=admin` links still work.
- Protected staff pages send signed-out visitors to the corresponding login. The API validates the submitted role against the actual account before issuing a token. Selecting a portal never changes account permissions. Legacy API clients without a role retain existing behavior.
- Only worker login offers public registration. Staff accounts are provisioned through administration. Registration still rejects client-supplied privileged roles.

## DigiLocker mock

The user explicitly requested a mock because partner permission has not been obtained. Worker login and signup offer **Continue with DigiLocker**, using the supplied logo. The visible label says this is a demo and is not connected to DigiLocker. The expanded panel explains that it opens a shared demo worker account, with no Aadhaar access or identity verification.

Confirmation calls `POST /api/auth/digilocker/demo`. It can issue a session only for the existing active `worker@dakshsetu.demo` account. It rejects extra role/account fields, returns `demo: true` and `identityVerified: false`, and respects both server demo-login configuration and the administrator's demo setting. It creates no real identities and does not mark the profile or Skill Passport as DigiLocker verified. It cannot log in staff accounts. No new environment values are required for this mock.

Production disables the mock through the existing demo controls. No real OAuth requests, document downloads, Aadhaar forms, provider tokens, consent records or identity claims were fabricated. Real integration remains a separate task requiring approved credentials and an exact registered callback URL; see [DigiLocker implementation model](https://www.digilocker.gov.in/web/implementation-model).

## Verification

The full backend suite passes **53/53** and the complete UI suite passes **14/14**: **67 tests total**. This includes correct/wrong-role credentials, sign-out, DigiLocker mock entry and the existing assessment/evidence/human sign-off/Passport/reassessment/quality workflow. Localization coverage passes for **51 routes/states in Hindi and Marathi**. Production compilation, static bundle limits, the 27-asset offline shell and compiled-production smoke pass. Production smoke includes all three login URLs, signup, the supplied DigiLocker image and rejection of the mock endpoint when demo access is disabled. Logs are under ignored `server/data/login-*.log`.

Actual browser inspection was attempted twice, including a browser runtime reset. Both attempts failed before obtaining a tab with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. Therefore browser rendering, real viewport behavior, screenshots and keyboard/device usability were not verified. UI/API tests use local React source in JSDOM connected to isolated Express/MongoDB test instances and are not described as browser testing.

The new UI test exercises role selection, correct credentials, wrong-role rejection, absence of a session after rejection, staff registration visibility, sign-out, and the explicit mock entry from signup. API tests cover all nine account/portal combinations, invalid roles, mock role-field rejection, disabled mock access and the existing account lifecycle/authorization flows.

## Manual browser review

1. Open `/login/worker`, `/login/assessor` and `/login/admin`. Check the selected portal and heading; try credentials belonging to a different role and confirm no session is created.
2. On worker login or `/register`, expand Continue with DigiLocker. Confirm the demo disclosure remains visible before using Continue with demo worker. It opens the shared worker dashboard.
3. Check the three pages at laptop and phone widths, keyboard focus, Hindi and Marathi. Sign out between roles.
4. With demo login disabled in system settings, the demo confirmation is disabled in the UI and rejected by the API. Standard permitted accounts keep working.
