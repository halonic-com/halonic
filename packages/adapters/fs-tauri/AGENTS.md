# @halonicjs/adapter-fs-tauri

Owner: priya · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The TrustStore, RunStore, BlobStore, RecordStore, DefinitionStore and HostSettingsStore ports over the Studio shell's trust_*, run_*, blob_*, record_*, fs_* and host_settings_* commands, sharing the trust folder, the run, blob and record folders, the workspace files and the host settings with the CLI and one opened-folder list with git.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-fs-tauri -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
