# Decision: the PR build job may run 25 minutes instead of 15

- Task: HAL-9800
- Approval: Liam approves this note in review of PR #2799
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ADJ5Bv9gnuAK6hjKUWxP3TLOZLx/TW9OxfBvurKQ35C17XqAy5xeEacTz5isfw5WcH/seLuGM346n3VVZI9GDg==

## What changes

In `.github/workflows/ci.yml`, the `Typecheck, lint, test, build` job gets `timeout-minutes: 25`
instead of 15. Nothing else in the workflow changes: no trigger, right, runner or secret.

## Why

Over the last 200 PR runs, successful jobs took a median of 5.5 minutes, p90 11.7, p95 13.4 and
at most 14.9. A cold turbo cache after a change to a low-level package takes about 840 s in one
step, so those runs end just under the old limit, and others are cut at 15 with no failing test.

## Tests

No test was weakened or skipped.

## Covers

- .github/
