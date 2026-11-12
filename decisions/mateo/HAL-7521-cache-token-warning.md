# Decision: CI warns when main runs without the remote cache

- Task: HAL-7521 (checking the remote cache on `main` after a routine key rotation)
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

In the job "Typecheck, lint, test, build" in `.github/workflows/ci.yml`:

- The step "Get a write token for the remote cache" prints a `::warning` before it falls back to the local cache: when GitHub gives no OIDC token, when the cache refuses the token exchange, or when the cache answers without a token. The last case used to pass an empty token on without a word.
- The step "Run every task through the cache" prints a `::warning` when it has a write token but no `TURBO_REMOTE_CACHE_SIGNATURE_KEY`.

## Why

From 10 Nov the deployed cache worker was older than the OIDC token exchange and answered it with 401. Every `main` run fell back to the local cache, stayed green, and nobody noticed for two days. A warning shows on the run's summary page, so the next time it is seen on the first run.

No check is removed or weakened: the job passes and fails exactly as before, and pull requests (which never get a write token) see no change.

## Covers

- .github/
