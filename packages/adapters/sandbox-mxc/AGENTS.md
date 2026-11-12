# @halonicjs/adapter-sandbox-mxc

Owner: ravi · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Sandbox port on MXC, Windows 11's process container.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-sandbox-mxc -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- Follow the grant rules from HAL-3503 (`requirements/grant-paths.md`, `requirements/box-folders.md`):
  grant folders, never single files, and never widen a grant to a file's parent; hand MXC every
  path through `grantPath`; never grant the drive root; a fresh box folder for every session.
- Never pass `captureDenials` to the SDK: it crashed the host process (HAL-3303).
- Never shell out to `cmd /c dir` inside the box, in code or tests: Windows 11 refuses it there.
  Use Node's `readdir`.
