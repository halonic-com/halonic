# cli.commands.google.allow-sending

- Status: active
- Since: unreleased
- Source: HAL-9044 (PR 9c); phase 4 plan on HAL-9, approved on HAL-8311; `app.connection-settings`; runs read it from HAL-15772, decided by Liam on HAL-15765 (C623)

The `halonic google allow-sending <connector> on|off` command shall switch sending on or off for the Google connector `<connector>` of the workspace in `--dir` (the current folder without it), through `ConnectionSettings.setAllowSending`, keyed by the workspace's resolved real path and the connector's id. It shall print "✓ Sending is on for <connector> in <workspace>." or "✓ Sending is off for <connector> in <workspace>." and exit 0, also when the setting already had that value. With `--json` it shall add `connection`, `workspace` and `allowSending`. It never switches sending on by itself: without this command, or with `off`, sending stays off. The runs of `halonic run`, `halonic runs send`, `halonic serve` and `halonic routines watch` in that workspace shall read the saved choice each time a tool labelled `send` is called (`cli.local-engine`); while sending is off, the refusal the model gets shall end with "to switch it on, run halonic google allow-sending <connector> on". It shall refuse a workspace that has no connector by that id with "not found" and exit 4, adding "Did you mean" when one id is close, and a connector that isn't a Google one with exit 2, saving nothing in both cases. Without a connector and a word `on` or `off`, or with anything else, it shall exit 2 with its usage and save nothing.

## Examples

- Given a workspace with the Google connector `mailbox` and no saved setting,
  when `halonic google allow-sending mailbox on` is run,
  then it prints "✓ Sending is on for mailbox in Acme." and the profile holds `allowSending: true` for that workspace and `mailbox`.
- Given sending is on for `mailbox`,
  when `halonic google allow-sending mailbox off` is run,
  then it prints "✓ Sending is off for mailbox in Acme." and the profile holds `allowSending: false`.
- Given sending is on for `mailbox` in Acme,
  when a run of Acme calls a `mailbox` tool labelled `send`,
  then sending is allowed; for the same connector in another workspace it is off.
- Given no saved setting for `mailbox`,
  when a run of Acme calls a `mailbox` tool labelled `send`,
  then the model gets `Refused: sending is off for the connector "mailbox": to switch it on, run halonic google allow-sending mailbox on`.
- Given the same workspace and a connector `bank` that isn't a Google one,
  when `halonic google allow-sending bank on` is run,
  then it exits 2 and nothing is saved.
- Given `halonic google allow-sending mailbox maybe`,
  then it exits 2 with the usage "halonic google allow-sending <connector> on|off [--dir <folder>]" and nothing is saved.
