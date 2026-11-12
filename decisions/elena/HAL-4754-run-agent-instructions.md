# Decision: a run keeps the hub's skills, and its agents get their instructions

- Requirements: `engine.run-agent-instructions` (new), `workspace.run-definitions` (edited)
- Task: HAL-4754
- Approval: [HAL-4754](/HAL/issues/HAL-4754), the CTO's review of this pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HnWCIojKznmA+WMHx5dKPVqjeIukS7IV3a8hR1l8IB/peJvYRqg641Nj0lKNJJFp5k6xBJ2c+tPzDbRQPjDODg==

## What changes

A new run now keeps the hub's skills with the rest of its definitions (`workspace.run-definitions`
gains "and skills"), so a waiting run goes on with the skills it started with. Each model call of a
workflow step, and each subagent's turn, starts with a system message built from the agent's kept
file: its instructions, its skills, the delegation and connector lines, and how to reply for a
choice or JSON output (`engine.run-agent-instructions`).

Because the kept definitions now hold the skills, their hash changes, so the two `halonic run`
golden files show a new `definitionsVersion`. Nothing else in them changes.

## Why

The old runner (784f78d) sent the agent's instructions and skills as a system message with every
model call of a workflow step. Without it, an agent's file had no effect on what it was told in a
run. This closes the instructions half of the parity gap HAL-4754.

## Tests

No test was weakened. The workspace test now also checks the skills a run starts with. The new
behaviour has its own tests in `packages/core/engine/src/run/local-runs-instructions.test.ts`.

The golden files sit in `apps/cli`, so the guard also compares the `expect` count of
`cli.commands.routines.watch` (227 on this branch, 250 and 255 on main in two runs). This pull
request changes no routines code or test. The count is measured at run time and its polling tests
drift between runs (see HAL-5568), so the note covers it.

## Covers

- workspace.run-definitions
- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- cli.commands.routines.watch
