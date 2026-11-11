# @halonicjs/adapter-mcp

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Our own MCP client: the MCP protocol session, the http connector, and the stdio connector that starts a trusted program.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-mcp -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- `src/protocol/` has no `node:` imports and no transport code: an integration must be able to
  import it unchanged. `src/protocol/imports.test.ts` checks this.
- `src/protocol/` is the source copy of the MCP protocol (see the README). Tell Ravi on the task
  when you change it, so `integrations/mcp` doesn't drift.
