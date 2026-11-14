# cli.commands.google.allow-sending

- Status: active
- Since: 0.1.0
- Source: HAL-9044 (PR 9c); phase 4 plan on HAL-9, approved on HAL-8311; `app.connection-settings`

The `halonic google allow-sending <connection> on|off` command shall switch sending on or off for the Google connection `<connection>` of the workspace in `--dir` (the current folder without it), through `ConnectionSettings.setAllowSending`, keyed by the workspace's resolved real path and the connection's id. It shall print "✓ Sending is on for <connection> in <workspace>." or "✓ Sending is off for <connection> in <workspace>." and exit 0, also when the setting already had that value. With `--json` it shall add `connection`, `workspace` and `allowSending`. It never switches sending on by itself: without this command, or with `off`, sending stays off. It shall refuse a workspace that has no connection by that id with "not found" and exit 4, adding "Did you mean" when one id is close, and a connection that isn't a Google one with exit 2, saving nothing in both cases. Without a connection and a word `on` or `off`, or with anything else, it shall exit 2 with its usage and save nothing.

## Examples

- Given a workspace with the Google connection `mailbox` and no saved setting,
  when `halonic google allow-sending mailbox on` is run,
  then it prints "✓ Sending is on for mailbox in Acme." and the profile holds `allowSending: true` for that workspace and `mailbox`.
- Given sending is on for `mailbox`,
  when `halonic google allow-sending mailbox off` is run,
  then it prints "✓ Sending is off for mailbox in Acme." and the profile holds `allowSending: false`.
- Given the same workspace and a connection `bank` that isn't a Google one,
  when `halonic google allow-sending bank on` is run,
  then it exits 2 and nothing is saved.
- Given `halonic google allow-sending mailbox maybe`,
  then it exits 2 with the usage "halonic google allow-sending <connection> on|off" and nothing is saved.
