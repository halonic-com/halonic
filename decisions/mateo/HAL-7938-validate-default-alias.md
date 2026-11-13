# Decision: `halonic validate` warns when a hub's agents would call a default model alias no file has

- Task: HAL-7938
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

`halonic validate` now also lists a warning, code `unknown-default-model`, for each hub whose agents without a model would call a default model alias that no file has. The warning sits on the first such agent's file, like the other warnings: it exits with 0, and with `--strict` with 1. The requirement gets one sentence and one example for this; nothing it said before is removed or weakened.

## Why

An agent without a model uses the `default` alias. When no `models.yaml` has that alias, the run fails only later, when it starts. `validate` is where the user looks for such problems, so it says so there.

## Covers

- cli.commands.validate.check-workspace
