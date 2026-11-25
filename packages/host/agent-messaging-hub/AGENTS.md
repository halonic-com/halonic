# @halonicjs/host-agent-messaging-hub

Owner: tomas · Layer: host · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The messaging hub that joins every `AgentMessaging` provider into one, and the Paperclip key guard (`PaperclipKeys`), on Web-standard APIs only, shared by the desktop agent host and the server.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/host-agent-messaging-hub -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- A key leaves `PaperclipKeys` only into the request `callWith` runs after its address and company check. Never add a method, field or log line that hands out the key (`agent-host.paperclip-key`).
- The hub depends only on the `AgentMessaging` port: timers, files and the network stay in the host that uses it.
