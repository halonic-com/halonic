# cli.run-proposal

- Status: active
- Since: unreleased
- Source: HAL-6477; option 3 on HAL-6476, approved by the board on HAL-9332 (18 Nov): a harness run in `halonic run` ends with a line saying a proposal is waiting and which command shows it; wording decided by the team (HAL-2282)

When a workflow has an agent in a harness, `halonic run` shall start it, once every check of `cli.run-harness` and `cli.run-sandbox-gate` passes and the agent's instructions are trusted (`cli.local-harness-host`), in the engine on this computer. The agent shall write workspace files only in its run's proposal folder, never in the workspace, so nothing in the person's files changes until they accept. When the run ends (finished or failed) with a proposal, the command shall print, after a blank line under its other result lines, "Run <short id> proposes changes to <n> files. Nothing in your files changed yet: see them with halonic proposals show <short id>." keeping the user's `--dir`, and `--json` shall give the proposal as `proposal`. A run that changed no file, or that waits for the person, shall print no such line.

## Examples

- Given Coder in Claude Code wrote `change.txt` in its folder,
  when `halonic run lab/change` finishes,
  then it ends with "Run 01jd8q proposes changes to 1 file. Nothing in your files changed yet: see them with halonic proposals show 01jd8q.", exits 0, and `files/agents/coder/change.txt` isn't in the workspace.
- Given Coder changed no file,
  when the run finishes,
  then no proposal line is printed.
- Given Acme isn't trusted and the sandbox starts,
  when `halonic run lab/change` runs,
  then it shows the trust check, exits 3 and starts no program.
