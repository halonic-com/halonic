# cli.commands.trust.instructions-run-version

- Status: active
- Since: unreleased
- Source: HAL-16386, the follow-up of HAL-16335's plan approved by Liam; the not-committed line is `cli.commands.trust.run-version`'s, with the command it names, a team decision under HAL-2282 on HAL-16386

The `halonic run` and `halonic runs send` commands shall pin a harness agent's selected skills from the version the run reads, as they read its definitions and its agent's file: the version the command loaded, or the version a run recorded when it is another one, never the saved files. The `halonic trust instructions <agent> [--dir <folder>]` command shall review the agent's instructions in the version `halonic run` would start (`cli.commands.trust.run-version`): the agent's file and its skills' `SKILL.md` from the latest commit, or the saved files when the folder isn't a git repository or has no commit yet, so the pin it trusts is the pin a run's instruction check finds and trusting clears the run's refusal. When the agent's file or one of its skills' `SKILL.md` it lists has saved changes that aren't committed, the command shall name each such file, workspace-relative and escaped, on one dimmed line after the rows and before `Fingerprint`, or after the ✓ line when the instructions are trusted already: "These saved changes aren't committed, so runs don't use them and this check doesn't cover them: <files>. Commit them, then run halonic trust instructions <agent> again.", with the user's `--dir` in the command when they gave one. A saved change to any other file shall not be named. When the folder is a repository but git can't start, the command shall trust nothing and refuse as `halonic run` does, with "Nothing was trusted." in place of "Nothing ran.".

## Examples

- Given Acme in git with the agent `coder` in Claude Code and its skill `review` committed, and a saved change to `review`'s `SKILL.md` that isn't committed,
  when `halonic trust instructions coder --dir acme --yes --fingerprint <the fingerprint it showed>` runs,
  then the pin it saves is that of the committed skill, and the instruction check of a run of that version finds it trusted.
- Given the same saved change,
  when `halonic trust instructions coder --dir acme` shows its list,
  then the line before `Fingerprint` reads "These saved changes aren't committed, so runs don't use them and this check doesn't cover them: hubs/lab/library/skills/review/SKILL.md. Commit them, then run halonic trust instructions coder --dir acme again.".
- Given Acme in git with nothing changed in coder's files since the latest commit, and a saved change to another agent's file,
  when `halonic trust instructions coder --dir acme` shows its list,
  then there is no line about saved changes.
