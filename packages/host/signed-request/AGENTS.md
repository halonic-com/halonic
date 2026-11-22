# @halonicjs/host-signed-request

Owner: tomas · Layer: host · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The signed-request format a deployment and Halonic Cloud use to talk to each other: Ed25519 signatures over method, host, path, product, customer, time, nonce, body hash and direction, on Web-standard APIs only.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/host-signed-request -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- A change to the signed message (`signedMessage`) changes the format: both sides must ship it together, so it needs a new format label, never an edit to `halonic-signed-request-v1`.
- Who may import it: hosts, apps and targets (for example the Cloudflare target's runtime). Adapters and core may not import a host package, so an adapter gets the verified result passed in by its target instead.
- Halonic Cloud (`halonic-com/cloud`) runs this package from a pinned commit; keep it free of halonic dependencies other than `@halonicjs/std`.
