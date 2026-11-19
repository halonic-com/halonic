# Decision: the CLI names a model alias the hub doesn't have, and exits with its kind

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12377 (Liam, CTO; decided in the task)
- Kind: user-visible
- Task: HAL-12377

A run of a workspace made with plain `halonic init` stopped at its first agent step with
"Halonic can't tell the cause yet… report it" and exit 1, though the cause is known: the hub has
no `default` model alias. `validate` already warns about it, so this builds on wording the team
has.

**`app.run-failure` and `cli.run-failure`.** The resolver's error now carries the cause
`models.unknown-model-alias` with the alias and the hub. The app's failure facts read it as
`unknown-model-alias`, so Studio gets the same fact, and the CLI prints:

    hub notes has no model alias default.
    Add default to models.yaml, or set a model on the agent. For a test model with no key, copy models.yaml and providers/mock.yaml from the Acme example.

There is no report link.

**`cli.run`.** A run the workspace's setup stopped (a provider type Halonic can't call, or a model
alias the hub doesn't have) exits with the exit code of its cause's kind, 4 for `not_found`,
rather than 1. That is the kind `--json` already shows in the run's `cause`, so a script reads the
same answer from both. Exit 8 for a budget stop and 1 for any other failed run stay as they were.

No test was removed or loosened. New tests cover the cause, its two lines and the exit code.

## Covers

- app.run-failure
- cli.run-failure
- cli.run
