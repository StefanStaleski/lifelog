# Event fixtures

Contract examples for `POST /api/v1/events/batch` (API responses the phone reads live in `../api`),

- `packages/shared/src/events.test.ts` checks every file in `valid/` parses with `EventSchema` and every file in `invalid/` is rejected.
- Android unit tests deserialise `valid/` into the Kotlin models (added in task 11).

Name each `invalid/` file after the rule it breaks. Never put real personal data here.
