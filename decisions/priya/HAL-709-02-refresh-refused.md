# Decision: the setup record keeps a refused token refresh

- Requirements: `google-setup.setup-record-holds-no-secret` and `google-setup.setup-record`
  (`packages/core/google-setup/requirements/`)
- Task: HAL-709 (build plan B4), with the field approved in HAL-1107 and its security review in HAL-1106
- Approval: the maintainer approved the D5 change in HAL-1107; the security reviewer confirmed it in HAL-1106

## What changes

The list of values a setup record may hold (plan D5) grows by one: `refreshRefused`, the reason
for the last refused token refresh (`client`, `sign-in` or `client-gone`) and its time, or `null`.
`setup-record-holds-no-secret` lists it, and its test's list of keys has the new key. In
`setup-record`, a finished sign-in also clears the refusal.

Nothing either requirement promised before is taken away. The record still has no place for a
secret, a token or text from Google: the reason is a fixed word, checked by a strict enum, and the
time is checked by the same pattern as every other time in the record. A record written before
this change has no such key and reads as not refused. A key that is there but malformed makes the
record damaged, so it can't be used to refresh.

## Why

Without it, nothing stops the next run from refreshing a token Google has refused, and a restart
would forget the connector state. That breaks "no retry loop" (design 5.2). Keeping it in host
memory instead would send one more refused refresh after every restart.

No test was weakened; the new field has its own tests in `src/refresh-refused.test.ts`.
