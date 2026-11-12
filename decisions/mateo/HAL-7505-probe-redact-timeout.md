# Decision: the live probe hides the account ID in every detail and gives up on a request after 20 seconds

- Task: HAL-7505 (follow-up to HAL-7483)
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

In `tooling/check/src/lib/live-probe.ts`, `probeAccount` replaces the account ID (plain and URL-encoded) with `<account-id>` in the detail of every result, including the text of a thrown error. Some Cloudflare errors repeat the request path, which holds the ID, and the detail ends up in the CI log. `cloudflareGet` passes `AbortSignal.timeout(20_000)` to `fetch`, so the timeout covers reading the body as well as the headers. A timed-out request fails its check with "the request timed out after 20 s." and the probe goes on.

`tooling/check/requirements/live-probe.md` states both rules with one example each.

## Why

The probe must never print the account ID (ADR 5.9, HAL-6804), but an error message that repeats the path did exactly that. Without a timeout, one stalled Cloudflare request held the live-suite job until the CI limit, with no hint of which check hung.

No check is removed or weakened; the probe reports the same checks, and only the detail text changes.

## Tests

No test was skipped or weakened. `live-probe.test.ts` gains tests for a 403 that repeats the path, a thrown error, a request that hangs, and a request whose headers arrive while the body stalls.

## Covers

- check.live-probe
- tooling/check/
