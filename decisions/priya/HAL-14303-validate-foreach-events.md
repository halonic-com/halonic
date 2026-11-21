# Decision: a task step without an agent is an error, and the template check reads a signal's data

- Approval: HAL-14303
- Kind: user-visible

## What changes

- `workflow.validate`: `task-without-agent` is an error, not a warning, and its message is worded like the run's cause: `Task "<step>" names no agent, so every run fails there. Give it an agent (agent: <id>), or make it a wait step.` The requirement now says a message given there replaces the old one.
- `workflow.validate-template-names`: a step's `signal` `data` is checked too. Like a `when`, it can read what its own step writes, because the engine renders it after the step's output.
- `studio.workspace-workflows`: a new workflow's `start` runs the hub's first agent by id, so it has no error or warning when the hub has an agent. In a hub with no agent it has one error, that `start` names no agent, and no warning. Before, `start` never had an agent, and the workflow had no error and the warning that `start` passes straight through.
- `allowed-differences.json`: the proposed entry `task-without-agent-is-an-error` allows the parity case `workflow/task-without-agent` to give the error where the old loader gave the warning. The workspace test of that case now checks the error on its own instead of the old recording.

New requirements, not edits: `workflow.validate-item-names`, `workflow.validate-foreach-items` and `workflow.validate-done-transition`.

## Why

Nina's C340 check (HAL-14271, rows 15–19) ran each of these on a fresh project. The engine fails a task step without an agent as soon as it is entered (`Task state "<step>" names no agent.`), so the warning promised something the run never does (C37). A misspelled name in a signal's data sent the routine an empty value with no problem shown (C10+).

Nina's C477 check (HAL-14757) found that Studio's New workflow wrote exactly this case, so every new workflow would fail `validate` and its first run. Studio has no way to pick a step's agent on `main` yet (HAL-12216 adds it), so the new workflow takes the hub's first agent by id, which a person can change in the file. In a hub with no agent the workflow can't run until it gets one, and the error says what to do next. The canvas shows it on the step card as "Has no agent".

## Not done

Nina's C35 also asked for a warning on every `items: "{{input.<name>}}"`, to pass it as a JSON list. That warning would show on correct workflows, such as both for-each steps of the parity base, and whether the run's input gives a list is only known when it runs. So that fix goes in the run's cause (Julian's C29, HAL-14301), and `validate` reports only `items` that can never be a list.

## Tests

No test was weakened or skipped. `workspace-workflows.test.ts` expects 1 error and 0 warnings for a new workflow in a hub with no agent, and none in a hub with agents, where `start` runs the first by id. The parity list of requirements in `allowed-differences.test.ts` gains `workflow.validate`.

## Covers

- workflow.validate
- workflow.validate-template-names
- studio.workspace-workflows
- packages/testing/parity/allowed-differences.json
