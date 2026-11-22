# cli.sandbox-gate-on-hold

- Status: draft
- Since: unreleased
- Source: flow check C605 (HAL-15625), task HAL-15640; Studio's confirm-again Callout, microcopy 23.4; HAL-12597 (a refusal never offers "On this computer")

When the sandbox check of `cli.sandbox-gate` finds an agent that a person set to "On this computer" on this computer for an earlier version of its file, the agent shall need the sandbox, and the CLI shall say why. When the sandbox can start, the agent shall get one ! line before the run, in Studio's words and with where to confirm again: "_Writer_'s file changed since you chose On this computer, so it runs in the sandbox until you confirm again in Studio › _Writer_ › Harness › Where it runs.". When the sandbox can't start, line 2 of the refusal shall say after the fix "_Writer_ needs the sandbox because its file changed since you chose On this computer.", before any other way out the command offers, and shall not say where to confirm again. An agent nobody chose for gets neither.

## Examples

- Given Writer set to On this computer, and a pull that changed Writer's file,
  when the check runs on a computer whose sandbox starts,
  then the line is "Writer's file changed since you chose On this computer, so it runs in the sandbox until you confirm again in Studio › Writer › Harness › Where it runs.".
- Given the same, on a computer without bubblewrap,
  when the check runs,
  then line 2 of the refusal is bubblewrap's fix, then "Writer needs the sandbox because its file changed since you chose On this computer.", and exit 9.
- Given the same refusal for `halonic run`,
  when the hint for `--harness halonic` is added,
  then it comes after the sentence about Writer.
- Given an agent nobody chose for,
  when the check runs on a computer whose sandbox starts,
  then there is no line for it.
