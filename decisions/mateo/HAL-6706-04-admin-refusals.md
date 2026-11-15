# Decision: the Origin check accepts 401, 403 or 404

- Approval: Liam approved the requirement change in review (HAL-10172)
- Kind: internal

## What changes

- The requirement `cloudflare-live.transfer` now says a request that carries an Origin header is refused with 401, 403 or 404 (before: 401 or 403).
- The refusal checks and the fake Worker in `@halonicjs/testing-cloudflare-live` follow it: the fake Worker answers 404 for an Origin request.

## Why

The real Worker (`admin.ts`, `mayReachAdmin`) sends any request that has an Origin header on to the host server, and the host server answers 404. A 401 or 403 never comes back for that case, so a check that only accepts those two would fail on the first live run. The request is still refused; only the status differs.

## Tests

The package tests (41) cover the Origin check against the fake Worker, type-check and lint pass. Nothing ran against Cloudflare yet; the first live run checks the real 404.

## Covers

- cloudflare-live.transfer
