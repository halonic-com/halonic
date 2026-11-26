# cli.serve-rules

- Status: active
- Since: unreleased
- Source: HAL-18669 (S11c, follow-up of S11 HAL-18500, on the PR watcher's critical path HAL-17974), plan rev 1 approved by Liam there; ToolScript ADR `docs/adr/2026-11-24-toolscript.md`, sections 2.2 and 2.3

When `halonic serve` runs from the repository, its engine shall run a workflow's `rule` steps as `engine.rule-state` says, each in the Node worker isolate (`toolscript-quickjs-node.worker-isolate`): in a worker thread of its own, with the agent limits and no host functions, at most `toolscript-quickjs-node.worker-limit`'s number at once, so a rule that never ends fails its run at `limit.cpu` while the server goes on answering and other runs go on. `halonic run`, `halonic runs send`, `halonic routines watch` and the npm package's `halonic serve` shall run no rule step: a run shall fail at its first one with `Step "<name>" is a rule step, and rule steps can't run here yet. Remove the step to run this workflow.`

## Examples

- Given the watch hub's workflow `pick`, whose rule step `match` returns every pull request after the first, then a final step whose signal reads `{{context.decisions.merge}}`, a workspace with no model, and the input `{ "prs": [5, 7, 9] }`,
  when it is started on `halonic serve`,
  then the run completes, asks no model, and its signal carries `[7, 9]`.
- Given a workflow whose rule is `for (;;) {}`, started on `halonic serve`, and then `pick`,
  when both run,
  then `pick` completes while the first still runs, and the first then fails with `Rule step "match" failed with limit.cpu`.
- Given `pick`,
  when it is run with `halonic run`,
  then it fails with `Step "match" is a rule step, and rule steps can't run here yet. Remove the step to run this workflow.`
