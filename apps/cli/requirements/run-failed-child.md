# cli.run-failed-child

- Status: active
- Since: unreleased
- Source: HAL-15555 (the child's cause on the parent's line, read from the child's own log, decided by Liam on the task; `halonic run` ends a run as `runs show` does)

When a run that `halonic run` or `halonic runs send` follows fails in a `workflow` or `foreach` step because a child run it started failed (`app.failed-child-run`), the CLI shall end it with the same lines `halonic runs show` ends it with (`cli.commands.runs.show-child-failure`): the child's own failure lines led by the run's step, and `See that run: halonic runs show <child's short id>`.

## Examples

- Given Many, whose for-each step Each runs Sort one for each topic, and Sort one's for-each step Each word, whose items are its topic, a text,
  when `halonic run many --input '{"topics":["Monday"]}'` runs,
  then it ends with "✕ Many failed in the step Each: the run it started for item 1 failed in the step Each word: its items ({{input.topic}}) are a text, not a list.", then the fix, then "  See that run: halonic runs show <child>".
