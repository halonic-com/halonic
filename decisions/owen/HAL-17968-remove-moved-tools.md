# Decision: my_prs and task_get leave Agent tools, now that the workspace plugin answers them

- Task: HAL-17968
- Approval: Liam approves this change on HAL-17968, for HAL-17968. A team decision with no board card (HAL-2282 rule).
- Kind: internal

## What changes

The Agent tools plugin no longer declares or registers `my_prs` and `task_get`. The workspace
plugin (workspace-company 0.6.0, built from its `main` at `d03d0ad`) serves both, and the
comparison on HAL-17968 shows the same answers: `task_get` byte for byte, `my_prs` with the
`cloud` pull requests, hidden private titles and approvals on the head (checked on HAL-18526).

The code only those tools used goes with them: `src/pr-tools/my-prs.ts` and
`src/task-tools/task-view.ts`, and the tests that called them. `comment` stays in Agent tools
and keeps its tests. The gh guard still points `gh pr list` and `gh pr status` to `my_prs()`,
now loaded from the workspace plugin.

Tests that used `my_prs` only as an example call now use `pr_status` (the slow GitHub test and
the metrics test, which now has a pull request `pr_status` answers), or `comment` (the task
tools' refusal and metrics tests). The runtime parity test (`paperclip.workspace-runtime-today`)
now compares `pr_status` only.

`pr_status` and `failed_runs` stay in Agent tools: the workspace plugin names the reviewer's
role instead of the reviewer, and counts failed runs only since its last install. The other
five reads stay as the task allows (see HAL-17968).

## Why

HAL-17968 moves each tool out of Agent tools once the workspace plugin answers it as Agent tools
does, so agents don't see the same tool twice with two answers.

## Covers

- paperclip.pr-tools
- paperclip.task-tools
- paperclip.pr-watcher-cloud
- paperclip.agent-tools-metrics
- paperclip.pr-tools-reapproval
- paperclip.workspace-runtime-today
- tooling/paperclip/src/pr-tools/pr-tools.test.ts
- tooling/paperclip/src/plugin/task-tools.test.ts
- tooling/paperclip/src/plugin/tools.test.ts
- tooling/paperclip/src/pr-watcher/cloud.test.ts
- tooling/paperclip/src/workspace-tools/todays-tools.test.ts
