# cli.runs-show-sending-off

- Status: active
- Since: unreleased
- Source: HAL-15772, decided by Liam on HAL-15765 (C623: a run whose send was refused because sending is off showed "Sent nothing", and `runs show` couldn't say why)

When `halonic runs show` shows a run whose log has a `tool.refused` with the reason `sending-off` (`events.tool-refused`), it shall print, after the step lines and the lines for connectors that didn't start, and after a blank line, "! The call to <tool> was refused: sending is off for <connector>, so nothing was sent.", once for each connector and tool, in the order of the log. A run with no such refusal shall get no such line.

## Examples

- Given a finished Mail triage run whose step Read the email logged two `tool.refused` events for `send_mail` on `mail` with the reason `sending-off`,
  when `halonic runs show` shows it,
  then after "✓ Read the email   Writer · default   1 s" and a blank line it prints "! The call to send_mail was refused: sending is off for mail, so nothing was sent." once, then the run's ending.
- Given a run whose only `tool.refused` has the reason `not-offered`,
  when it is shown,
  then the ending follows the step lines with no such line.
