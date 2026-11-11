# @halonicjs/app-studio

Owner: elena · Layer: apps · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Studio app: wires the Studio packages and features together. The Tauri shell and its Android project live in src-tauri; Vite builds only the Android app's own page (`connect.html`).

This package may change only through tasks that name it. It is an application, so nothing imports it;
its packages and features are listed in `package.json`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/app-studio -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
