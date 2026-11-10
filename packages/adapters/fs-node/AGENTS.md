# @halonicjs/adapter-fs-node

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The DefinitionStore, RunStore, RecordStore, TrustStore, AgentPlacementStore, ConnectionSettingsStore and BlobStore ports on the local file system with Node: plain files for definitions, one JSONL log per run and per record collection, one JSON file per profile record, one file per blob.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                                                | What it does                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-fs-node -- --maxWorkers=2`       | runs this package's tests (and the codegen they need)                      |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2`                   | lints the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run typecheck --concurrency=2`                                        | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
