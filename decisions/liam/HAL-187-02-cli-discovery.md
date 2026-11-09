# Decision: run the CLI command discovery in `codegen`

- Path: `turbo.json` (a guard path)
- Task: HAL-187, plan section 6.1 (`apps/cli/src/commands/<name>/`, discovered; help text generated from each command)
- Approval: Julian reviews the guard path; Mateo reviews `tooling/discover`

## What changes

`pnpm discover` now also writes `apps/cli/src/generated/commands.ts` from the folders under
`apps/cli/src/commands/` that hold a `command.ts`. In `turbo.json`, the `//#codegen` task gets:

- the input `apps/cli/src/commands/*/command.ts`, so adding or removing a command runs codegen again;
- the output `apps/cli/src/generated/**`, so a cached codegen restores the command list.

Nothing is removed, and no test, requirement or golden file changes.

## Why

The plan replaces the old CLI's command `switch` (23 commits of churn) with one folder per command
and a generated list, the same way Studio features are registered. Without the new input, turbo
would reuse a cached codegen after a command is added and the CLI would miss it; without the new
output, a cache hit would leave the generated file out.
