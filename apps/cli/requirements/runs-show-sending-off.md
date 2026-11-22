# cli.runs-show-sending-off

- Status: active
- Since: unreleased
- Source: HAL-15772, decided by Liam on HAL-15765 (C623: a run whose send was refused because sending is off showed "Sent nothing", and `runs show` couldn't say why); the fix line from HAL-15891 (C646 on HAL-15887: the line didn't name the command the model's refusal names); the line's words from HAL-15897 (C645 on HAL-15886: one cause in the failed call's words, and the fix in the same line)

When `halonic runs show` shows a run whose log has a `tool.refused` with the reason `sending-off` (`events.tool-refused`), it shall print, after the step lines and the lines for connectors that didn't start, and after a blank line, "! The call to <tool> (<connector>) wasn't made, because sending is turned off.", in the words of a failed call's line (`failed-call-words.ts`), once for each connector and tool, in the order of the log. The same line shall go on with how to switch sending on, as the model's refusal does: for a Google connector of the workspace's own files, "To switch it on, run halonic google allow-sending <connector> on.", with the user's own `--dir` after `allow-sending` when they gave one; for any other connector, "Halonic can't switch it on for <connector> yet." A run with no such refusal shall get no such line.

## Examples

- Given a finished Mail triage run whose step Read the email logged two `tool.refused` events for `send_mail` on `mail` with the reason `sending-off`, and a workspace whose `mail` is a Google connector,
  when `halonic runs show` shows it,
  then after "✓ Read the email   Writer · default   1 s" and a blank line it prints "! The call to send_mail (mail) wasn't made, because sending is turned off. To switch it on, run halonic google allow-sending mail on." once, then the run's ending.
- Given the same run shown with `--dir .`,
  then the line ends "To switch it on, run halonic google allow-sending --dir . mail on.".
- Given the same run in a workspace whose `mail` is a stdio connector,
  then the line is "! The call to send_mail (mail) wasn't made, because sending is turned off. Halonic can't switch it on for mail yet."
- Given a run whose only `tool.refused` has the reason `not-offered`,
  when it is shown,
  then the ending follows the step lines with no such line.
