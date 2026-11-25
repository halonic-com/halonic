# @halonicjs/plugin-build

Owner: noah · Layer: core · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Builds a Paperclip plugin's bytes: a reproducible ustar archive, its sha-256, the release file and the change list between two snapshots.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/plugin-build -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- The archive holds the four fixed names in `pluginFileNames` and nothing else. Never add a name
  that comes from a workspace, and never loosen `tarNameProblem`.
- Anything read back from disk (a release file, an archive, its snapshot) is untrusted: check its
  size and sha-256 before reading it, and parse it with a strict schema.
- No Node or browser APIs: the caller passes the sha-256 in, and UTF-8 comes from `@halonicjs/std`.
