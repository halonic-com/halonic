# cli.run-failed-instructions

- Status: active
- Since: unreleased
- Source: HAL-13062 (from Julian's check M2 of #3827 on HAL-13057; the way past the refusal is the board's C on HAL-10522; the words are a team decision under HAL-2282, with Sofia, on HAL-13062)

When a run's log ends with `run.failed` for `instructions-not-trusted` and names the agent, `halonic run` and `halonic runs show` shall print line 1 "<workflow> failed in the step <step>: <agent> didn't start, because nobody has trusted its instructions on this computer yet." when no instructions were trusted for the agent before, "… because its instructions changed since they were trusted on this computer." when other instructions were, and "… because its instructions aren't trusted on this computer." when the check didn't answer, and line 2 "Review them and trust them with halonic trust instructions <agent>, then run again.", with the user's own `--dir`. Neither line shall say Halonic can't tell the cause, or ask for a report. A `run.failed` that names no agent shall get the general lines.

## Examples

- Given a run that fails with `instructions-not-trusted` for `coder`, which never had instructions trusted,
  when its failure lines are worked out with `--dir ./acme`,
  then line 1 ends "coder didn't start, because nobody has trusted its instructions on this computer yet." and line 2 is "Review them and trust them with halonic trust instructions coder --dir ./acme, then run again."
- Given the same refusal with `changed: true`,
  when its failure lines are worked out,
  then line 1 ends "coder didn't start, because its instructions changed since they were trusted on this computer."
- Given a `run.failed` for `instructions-not-trusted` with no agent,
  when its failure lines are worked out,
  then they are the general lines.
