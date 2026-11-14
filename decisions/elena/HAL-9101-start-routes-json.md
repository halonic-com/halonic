# Decision: the start routes refuse a body that isn't application/json

- Approval: HAL-9101, proposed by Liam in the review of #2615 (HAL-9100); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-9101

## What changes

The `server.trust-gate` requirement gains one sentence and one example: `POST /api/runs` and
`POST /api/agent-runs` answer 415 `unsupported_media_type` for any body whose `Content-Type` isn't
`application/json`, before the gate is asked, with a password or without one.

Nothing else in the requirement changes. No test was weakened or removed; the trust-gate tests gain
attack cases for form posts with no `Origin`.

## Why

On a server with no password no cookie is needed, and a browser that leaves out `Origin` passes the
origin check. A cross-site `text/plain` form with a body shaped like JSON could then start a run.
Requiring JSON closes that, because a web page can't send `application/json` across sites without a
preflight the server doesn't allow.

## Covers

- server.trust-gate
- packages/host/server/src/trust-gate.test.ts
