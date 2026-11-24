# @halonicjs/adapter-toolscript-quickjs

Owner: mateo · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Runs a ToolScript in a fresh QuickJS (WASM) isolate per run, with the eval prelude, the plain-data copy, per-run secret handles and the ADR 2.3 limits

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-toolscript-quickjs -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Engine build

The isolate runs our own QuickJS-ng build (HAL-17780), not a package from npm.

- `engine/SOURCES.json` is the only record of what it is built from: the quickjs-ng release and
  its sha256, the wrapper commit (quickjs-emscripten v0.32.0) and the sha256 of every file taken
  from it into `engine/upstream/`, and the emsdk image by digest. Changing any of them needs
  Liam's approval and goes through the security review (Julian).
- Approved toolchain: `emscripten/emsdk:5.0.1`, pinned by digest, for the CI job
  `toolscript-engine` only (Liam, HAL-17780). Moving to another emsdk is its own task, after a
  check that its glue still matches `quickjs-emscripten-core` 0.32.0.
- `engine/upstream/` holds the pinned files unchanged. Our changes to them are
  `engine/interface.patch` and the flags marked "Halonic" in `engine/build.sh`.
- `src/generated/engine/` is the build. Never edit it: change the inputs, push, and commit the
  `toolscript-engine` artifact of that push's CI run. The job fails when the committed files
  differ from the build by a single byte. With Docker, `pnpm --filter
  @halonicjs/adapter-toolscript-quickjs build:engine` rebuilds it locally.
- Every run gets a memory of `moduleMemoryBytes` (`src/engine.ts`, the same number as
  `build.moduleMemoryBytes`) plus its `memoryBytes`, created with initial == maximum, so it
  can't grow past that.

## Local rules

- Name nothing on GitHub after an engine flaw: describe what a test checks ("iterator helpers
  that close early").
