# cli.run-instructions-prompt

- Status: active
- Since: unreleased
- Source: HAL-13062; the prompt at a terminal is the board's C on HAL-10522; the words follow `halonic trust instructions` (`cli.commands.trust.instructions`) and are a team decision under HAL-2282, with Sofia, on HAL-13062

When a `halonic run` ends refused because nobody trusted an agent's instructions (`instructions-not-trusted`) and someone can answer (a terminal on stdin, no `CI`, no `--json`), the CLI shall show the files the run's check saw, each row naming the workspace file a person reads as `halonic trust instructions` does, tagged New, Changed or Removed when other instructions were trusted before, and their full fingerprint, and ask "Trust coder's instructions on this computer? [y/N]". On yes it shall trust exactly the pin the check logged, never the files as they are now, print "✓ coder's instructions are trusted on this computer. Starting the run again." and start the run again once; the refused run stays in the log. On No, or when nobody can answer, it shall ask nothing more, trust nothing and end with the refused run's lines (`cli.run-failed-instructions`), so a headless run, such as one in CI, a routine or `serve`, keeps refusing. `halonic run` has no option that trusts instructions without a person's answer.

## Examples

- Given Acme, trusted, with the agent `coder` in Claude Code whose instructions nobody trusted,
  when `halonic run lab/change` runs in a terminal and the user answers `y`,
  then it shows "Trust check for coder's instructions" with the row `Instructions` and the agent's file, asks, prints "✓ coder's instructions are trusted on this computer. Starting the run again.", the second run starts the program, and it exits with 0.
- Given the same Acme,
  when the user answers `n`,
  then no program starts, the lines name `halonic trust instructions coder`, and it exits with 1.
- Given the same Acme and `--json`,
  when `halonic run lab/change --json` runs, even in a terminal,
  then it asks nothing, no program starts, and it exits with 1.
