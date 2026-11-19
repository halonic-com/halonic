# Decision: a workflow's steps say which agent runs in Claude Code or Codex

- Task: HAL-4291 (the workflow page's Run, PR 2 of 4)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-4291 (the CTO's scope for this task: Run is unavailable while the sandbox can't start, checklist 3.1 and 3.3 of HAL-1833)
- Kind: internal

## What changes

Two requirements gain what the workflow page's Run needs to know whether a run would start the
sandbox:

- `cli.workspace-models` also finds, for each state of a workflow, the agents it runs: its own
  agent, its branches' and those of a workflow it starts. One example is added.
- `studio.workspace-workflow-read` gives, for a step that runs an agent in Claude Code or Codex,
  the first such agent with its name and program. One example is added.

Nothing either requirement promised before is taken away; the read gains a field.

## Why

Run is only unavailable when a step would start Claude Code or Codex, because only those run in
the sandbox. The workflow page reads its workflow from the workspace's files, never the engine, so
the read has to carry this, and the page's last Callout line names the step, its program and the
agent's settings.

## Tests

No test was weakened or skipped. The new cases have their own tests in
`packages/adapters/workspace-models/src/workflow-agents.test.ts` and in `apps/studio/src/workflows/workspace-workflow-read.test.ts`.

## Covers

- cli.workspace-models
- studio.workspace-workflow-read
