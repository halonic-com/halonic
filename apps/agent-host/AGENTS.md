# @halonicjs/app-agent-host

Owner: owen · Layer: apps · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Halonic's agent host as one Node program. It unpacks its files and serves on loopback with a token per launch; the sandbox, the bridge and the harnesses come next (HAL-4476).

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                                                | What it does                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@halonicjs/app-agent-host -- --maxWorkers=2`        | runs this package's tests (and the codegen they need)                      |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2`                   | lints the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run typecheck --concurrency=2`                                        | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |
| `pnpm --filter @halonicjs/app-agent-host build:sea`                                    | builds the single executable (CI does this on every OS; see the README)    |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- `src/main.ts` is the executable's main script: it may import only Node's own modules (and types). Everything else goes in the payload, loaded from `src/host.ts`.
- Every route goes through `startHostServer` (`src/server/host-server.ts`), which checks the `Host`, `Origin` and token before any route runs. Never add a listener of your own, and never print, log or store the token anywhere but the handshake line.
