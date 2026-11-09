# Decision: the setup record keeps B3's six check kinds

- Requirements: `google-setup.setup-record` and `google-setup.setup-record-holds-no-secret`
  (`packages/core/google-setup/requirements/`)
- Task: HAL-1176, a follow-up from HAL-708 (build plan B3)
- Approval: the maintainer changed plan D5 to revision 5 in HAL-1056 and approves this note in review

## What changes

1. **Each service in `services` holds B3's `ServiceCheckOutcome` and its time.** Before, an entry
   was `{ scopeGranted, check: "works" | "api-off" | "not-checked", checkedAt }` (D5 revision 4).
   Now it is `{ result, checkedAt }`, where `result` is one of `works`, `allowed`,
   `scopeNotGranted`, `apiOff`, `checkFailed` or `unreachable`, with that kind's fields. The
   `service-checked` edit carries the same `result`.
2. **`scopeGranted` is gone.** `scopeNotGranted` says the same, and also which scopes are missing.
3. **`ServiceCheckResult` is no longer exported.** The record and the check share one name,
   `ServiceCheckOutcome`, and a type test fails if the stored type and B3's type drift apart.

## What the record may still hold

Nothing either requirement promised is taken away. Every object is strict and every text has a
tight shape: a scope as the sheet check allows it, an API host, a short API name without a `:`, a
project ID or project number, a single-word Google reason code, and a status from 100 to 599. An
`apiOff` link must be exactly the Console page `enableApiUrl` makes from the API and the project, so
the record can't hold any other URL. Google's `message` and any other free text still have no place.

The API name follows the same rule as `GoogleApi.name` in the sheet check, so a check result for a
name the sheet check took is never refused when it is saved. A `/`, `.` and `,` are allowed, as in
"Cloud Pub/Sub API".

## Why

Step 7 needs more than "works or not" to say what to do next: which scopes the user unticked, which
API to switch on and where, and whether a failed check is worth trying again. Saving only the coarse
kind would mean running the checks again, which needs an access token the record never sees.

## Records written before

No released build writes `services` yet (B5, HAL-710, will be the first), so no stored record holds
the old shape. One that did would now read as damaged.

## Tests

The `service-checked` round trip now saves an `apiOff` result. New tests save one result of each
kind and read it back, and refuse free text, an extra key, a foreign link, another API host, a
part-there `apiOff`, an empty scope list and a bad status. A stored `apiOff` result with another API
host reads as damaged and is left out of the list, rather than making `read` and `list` throw. No
test was dropped or weakened.
