# cli.commands.trust.instructions

- Status: active
- Since: unreleased
- Source: HAL-13062 (from Julian's check M2 of #3827 on HAL-13057); the way to trust instructions is the board's C on HAL-10522: a prompt in `run` at a terminal and this command, with `--yes` only together with a matching `--fingerprint`; the words follow `halonic trust`'s and are a team decision under HAL-2282, with Sofia, on HAL-13062

The `halonic trust instructions <agent> [--dir <folder>]` command shall pin the agent's instructions as a harness run of it pins them, its `instructions` as `AGENTS.md` and each selected skill's `SKILL.md`, show them under "Trust check for coder's instructions", one row per file that names the workspace file a person reads (Instructions and the agent's file for `AGENTS.md`, "Skill review" and the skill's `SKILL.md` for a skill), with the full fingerprint (the pin's `sha256:` digest, never shortened), and ask "Trust coder's instructions on this computer? [y/N]". It shall save them as trusted, in the profile's instruction trust store the run's check reads, only on yes, after pinning them again and finding the same fingerprint. When other instructions were trusted for the agent before, it shall tag each file New, Changed or Removed, the tag at the end of the file's row, as `halonic trust` tags its rows. When the agent has no `harness`, it shall print "✓ writer runs in Halonic's own loop, so its instructions need no trust.", pin nothing and exit 0. When they are trusted already, it shall print "✓ coder's instructions are already trusted on this computer. Nothing changed." and ask nothing. `--yes` shall answer only together with a `--fingerprint` that is the current one; `--yes` alone shall be wrong usage (exit 2), and a fingerprint that isn't the current one shall save nothing, ask nothing and exit 3. When nobody can answer (no terminal, `CI` or `--json`) and `--yes --fingerprint` weren't given, it shall save nothing, print the list to stderr, the reason in the run's three cases (not trusted yet, changed since they were trusted, or what was trusted can't be read) and the command that trusts what it showed, with `--yes --fingerprint` and the fingerprint filled in, and the bare fingerprint as the last stdout line, and exit 3. An answer of No shall save nothing and exit 3. `<agent>` shall be an agent's id, or its hub and id when more than one hub has an agent with that id. Only this command, run by a person, shall call `InstructionTrustService.trust` in the CLI: nothing a run or a model's tool reaches does.

## Examples

- Given Acme with the agent `coder` in Claude Code, its instructions and the skill `review`, never trusted,
  when `halonic trust instructions coder --dir acme` runs in a terminal and the user answers `y`,
  then it shows the rows `Instructions   hubs/lab/agents/coder.agent.yaml` and `Skill review   hubs/lab/library/skills/review/SKILL.md` and the fingerprint, prints "✓ coder's instructions are trusted on this computer." and exits with 0.
- Given the same Acme and no terminal,
  when `halonic trust instructions coder --dir acme` runs,
  then stderr has "✕ coder's instructions aren't trusted on this computer yet, and there's no terminal to ask you." and "Read the list above, then run: halonic trust instructions coder --dir acme --yes --fingerprint " with that fingerprint, the last stdout line matches `^sha256:[0-9a-f]{64}$`, nothing is saved and it exits with 3.
- Given that fingerprint,
  when the command runs with `--yes --fingerprint <fingerprint>`,
  then it asks nothing and trusts them; run again, it says they are already trusted.
- Given trusted instructions and a skill changed since,
  when the command runs in a terminal,
  then the skill's row ends with the tag Changed and the Instructions row has no tag; without a terminal, stderr has "✕ coder's instructions changed since they were trusted on this computer, and there's no terminal to ask you."
- Given a fingerprint from before the skill changed,
  when the command runs with `--yes --fingerprint <old>`,
  then it prints "✕ That fingerprint doesn't match coder's instructions as they are now.", saves nothing and exits with 3.
