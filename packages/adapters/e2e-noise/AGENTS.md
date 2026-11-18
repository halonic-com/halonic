# @halonicjs/adapter-e2e-noise

Owner: owen · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The agent host's Noise session: snow built to WebAssembly, one instance per session, wiped when it ends.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-e2e-noise -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- This is security code: every change gets Julian's review, then Liam's (B1, HAL-12236).
- `src/noise.wasm` is built from `apps/studio/src-tauri/crates/e2e-noise-wasm` and never edited by
  hand. To change it, change the crate and commit the `noise-wasm` artifact CI builds from it.
- One WebAssembly instance per session, wiped when the session ends or fails. Never share an
  instance, never retry a call after a failure, and never pass the instance a pointer.
- No crypto of our own: Noise is `snow`'s, and the hashes are `node:crypto`'s.
