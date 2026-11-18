# Decision: Studio words a budget stop from run.failed's cause, with the CLI's sentence

- Task: HAL-12035
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12035 (Liam's decision on the task; reuses wording already approved in HAL-12016, a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6daGRUH2qlIrYxoot8IhGaojKN2+/1PauBbx1gEAgdtsJhOcREYI0zqG+IpPSANPUIT05s+80tly43YcRyY1CA==

## What changes

The run page's budget banner now reads the budget figures from `run.failed`'s `cause` (`budget.run` or `budget.month`, with limit, spend and currency) and says the CLI's sentence, plus its second line (`Raise budget.perRun in workspace.yaml.` or `Raise budget.monthly in workspace.yaml, or wait until it resets on …`), in the budget's currency. A budget stop with no cause, or a missing figure, keeps today's wording.

The requirement `runs.run-view.failure-banners` gains the budget paragraph and three examples (run, month, no cause). No test was weakened or skipped.

## Why

Since #3443 the CLI prints the limit and spend from the cause, while Studio said only that the budget was reached. Both now say the same thing.

## Covers

- runs.run-view.failure-banners
