# Decision: halonic runs show --output, and the hint that points to it

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12073 (shape decided by Liam on HAL-12071, a team decision on the approved `runs show` command)
- Kind: user-visible
- Signature: pending (Liam signs from a clean worktree of origin/main)

`halonic runs show` gains the flag `--output`, which prints what each agent step wrote under its step line. A finished run whose agents wrote something ends, in `halonic run` and in `runs show` without `--output`, with one more line, "Output: halonic runs show <run-id> --output". The requirements `cli.commands.runs.show` and `cli.run` say so, with new examples. Nothing they said before is removed or weakened. In the golden `support-reply-approved.txt` the colour and NO_COLOR modes gain that one line; no other golden changes and no test is dropped.

## Covers

- cli.commands.runs.show
- cli.run
- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/runs/golden/support-reply-output.txt
