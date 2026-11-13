# @halonicjs/oauth-sign-in

Owner: ravi · Layer: core · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

An OAuth 2.0 sign-in with PKCE and a loopback redirect: the rules (pending sign-ins, the callback, the token answer, the redirect URI) and the flow's requests, on ports only: randomness, SHA-256 and the request timeout come from the caller. It is a core package, not a host one, because a host package may not use another host package.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/oauth-sign-in -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- Nothing here names a provider. A provider's own rules (Google's error names, its ID token) stay in the provider's package and come in as settings.
