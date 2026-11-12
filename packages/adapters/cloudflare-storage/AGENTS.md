# @halonicjs/adapter-cloudflare-storage

Owner: priya · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The storage ports over Cloudflare's storage products, for the Worker. R2 holds the blobs and the deployed workspace snapshot (read only); D1 follows.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-cloudflare-storage -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- Runs in the Worker (`"runtime": "workers"`). The storage binding comes in through the constructor, so the
  adapter never imports `cloudflare:*` itself; only the `*.workerd.test.ts` suites do, to read the test
  Worker's bindings.
- The proof is the contract suite run inside workerd through `@halonicjs/target-cloudflare-testing`. Coverage of `src` comes from `r2-blob-store.test.ts`, which uses a small stand-in bucket, because Node's coverage can't see code that runs in workerd.
- No outside library, and no `node:*`: this code is part of the Worker bundle.
