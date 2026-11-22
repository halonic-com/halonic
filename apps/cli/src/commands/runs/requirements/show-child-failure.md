# cli.commands.runs.show-child-failure

- Status: active
- Since: unreleased
- Source: HAL-15555 (the child's cause on the parent's line, read from the child's own log, decided by Liam on the task; the words build on Studio's run page and `runs show`'s "the run that started it", a team decision under HAL-2282)

When a run failed in a `workflow` or `foreach` step because a child run it started failed (`app.failed-child-run`), `halonic runs show` shall end that run with the child's own failure lines, as `cli.run-failure` words them from the child's log, with line 1 led by the run's own step: `<run> failed in the step <step> because the run it started for item <n> failed in the step <child's step>: <reason>`, with the item counted from 1, or `the run it started` for a `workflow` step. Under the fix, it shall say `See that run with halonic runs show <child's short id>.`. A child that was cancelled, or whose log is gone, shall leave the run's own lines.

## Examples

- Given a run of Topics that failed in the step Each after its run for item 2 failed in the step Draft because Halonic couldn't reach Ollama,
  when `halonic runs show` shows it,
  then it ends with "✕ Topics failed in the step Each because the run it started for item 2 failed in the step Draft: Halonic couldn't reach Ollama at localhost:11434 for the model alias local.", then "  Start Ollama, then run again.", then "  See that run with halonic runs show <child>.".
- Given a run that failed in a `workflow` step whose child run failed with a reason the CLI can't name,
  when `halonic runs show` shows it,
  then line 1 says "… failed in the step Review because the run it started failed in the step Draft. Halonic can't tell the cause yet: …".
