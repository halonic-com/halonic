# Decision: halonic run words a budget stop as the budget, and exits 8 for it

- Task: HAL-12007
- Approval: a second engineer reviews it on HAL-12007, Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZFMLyry/bB+tbPD8nOcaAynDbIz8/OgJFTkPBOZoDmowAdO2qbKgNzysVYBZWQo3BI1bxLZEwTatIzhQPMJPDA==

## What changes

A run its budget stopped printed the general "Halonic can't tell the cause yet" lines and asked for
a bug report, and `halonic run` exited 1, although the help lists 8 for a limit reached.

- `cli.run-failure`: `budget` takes the budget, the spend and the currency from the engine's error,
  whose form `engine.budget-stop-message` fixes ("Run budget reached: 0.07 of 0.50 EUR spent." or
  "Monthly budget reached: … spent this month."), also when a parent run wraps a child's error, as
  Studio's budget notice already reads it. A monthly budget resets on the first of the month after
  the stop (UTC). An error that doesn't read that way keeps the general lines. Line 2 names the key
  to raise, `budget.perRun` or `budget.monthly`, instead of "the budget": small wording on the
  approved line (cli-output 3.4 revision 23), decided by the team.
- `cli.run`: `halonic run` (and `runs send`, which prints through the same code) exits 8
  (`limit_reached`) for a budget stop, so a script can tell a spent budget from a broken run. The
  code's meaning is unchanged: `exit-code.ts` already says 8 covers "a spend budget is used up".
  Every other failed run still exits 1, and `--json` still has `ok: false`.

## Covers

- cli.run-failure
- cli.run
