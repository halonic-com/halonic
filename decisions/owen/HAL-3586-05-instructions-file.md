# Decision: Claude Code reads the agent's instructions from a file

- Approval: HAL-3586, review follow-up on HAL-3623
- Kind: internal

C3 passed the agent's instructions to Claude Code with
`--append-system-prompt <instructions>`. Windows caps a whole command line
at 32,767 characters, so a long agent file would stop Claude Code from
starting there, with an unclear error. A process's arguments are also
visible to every program on the computer, which is why the prompt already
goes on standard input.

What changes:

- The run writes the instructions to `halonic-instructions.md` in the
  session's temp folder and passes `--append-system-prompt-file` with that
  file. The temp folder is the session's own, unlike the settings folder,
  which an agent's runs share. No file is written when the agent sets no
  instructions.
- `harness-claude-code.command` says so, and its first two examples name
  `--append-system-prompt-file` instead of `--append-system-prompt`. A new
  example covers instructions of 40,000 characters. Nothing else is
  removed.

To check: C4's manual run confirms that Claude Code 2.1.311 and later read
`--append-system-prompt-file` in `-p` mode. If they don't, the
instructions go with the first user message instead.

## Covers

- harness-claude-code.command
