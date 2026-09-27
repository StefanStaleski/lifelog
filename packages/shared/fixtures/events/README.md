# Event fixtures

Contract examples for `POST /api/v1/events/batch` (API responses the phone reads live in `../api`),

- `packages/shared/src/events.test.ts` checks every file in `valid/` parses with `EventSchema` and every file in `invalid/` is rejected.
- `apps/android/core/network/.../ContractTest.kt` decodes `valid/` and `../api` into the Kotlin models and checks they re-encode identically.

Name each `invalid/` file after the rule it breaks. Never put real personal data here.
