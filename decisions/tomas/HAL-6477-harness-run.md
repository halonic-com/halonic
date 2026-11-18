# Decision: `halonic run` runs harness agents, and points to `halonic proposals`

- Approval: the flow approved by the board on HAL-9332 (option 3 on HAL-6476); the package owner (Liam) approves this note in review
- Kind: user-visible

## What changes

`halonic run` no longer refuses a workflow with an agent in Claude Code or Codex. The agent runs in
the CLI's harness host (HAL-7747), writes only in its run's proposal folder, and the run ends with a
line that points to `halonic proposals show`, which reviews and accepts the change.

- `cli.run-harness`: item 6 (refuse every harness program with exit 9) is removed. Item 3 keeps its
  rule that a run that can't start shows no trust check, now for items 4 and 5. One example
  changes from exit 9 to the trust check (exit 3). The example "trusted, sandbox starts, exit 9" is
  removed; `cli.run-proposal` covers that case with the run that now starts.
- `cli.run-sandbox-gate`: the refusal sentence is replaced. The sandbox is still checked before the
  trust check for a harness agent (HAL-6580), and the engine reuses that answer instead of asking
  again. The exit 9 example for a working sandbox or "On this computer" becomes: "On this computer"
  isn't checked against the sandbox and the run goes on to the trust check.
- `cli.local-harness-host`: its last sentence said `halonic run` still refuses harness agents; it
  now says `halonic run` runs them and `halonic routines watch` still refuses them.
- New: `cli.run-proposal`.

Tests: in `harness.test.ts`, "refuses a harness program with exit 9 before the trust check" becomes
"checks the sandbox, then shows the trust check" (exit 3, sandbox checked once, no run), and
"passes every check, then refuses it" is removed: `harness-run.test.ts` runs that case through the
real engine with a fake Claude Code. In `sandbox.test.ts`, "refuses an agent in a harness once the
sandbox is fine" is removed for the same reason, and "refuses an agent set to On this computer the
same way" becomes "doesn't check the sandbox for an agent set to On this computer, and goes on to
the trust check" (exit 3, no sandbox check, no run).

## Why

The refusal existed only because the CLI had no way to show or accept a proposal (Liam, option 1 on
HAL-6476). `halonic proposals` now does that, with the board's yes on HAL-9332, so the refusal goes.
`halonic routines watch` keeps its refusal: a routine's runs have no one at the terminal, and turning
them on is its own step.

## Covers

- cli.run-harness
- cli.run-sandbox-gate
- cli.local-harness-host
- cli.run-proposal
