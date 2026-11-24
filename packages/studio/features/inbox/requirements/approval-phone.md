# inbox.approval-phone

- Status: active
- Since: unreleased
- Source: HAL-17820 (Chief with Nina, 24 Nov: option A), HAL-17821; `inbox.approval-card`, `inbox.wait-card`

While the device is a phone, the decided line after an approve that the run goes on from shall end "Approval sent." instead of "The run continues.", on the approval card and on the wait card alike, so the phone never promises a run it can't see, which may stop soon after at its budget. What the line says before it, and every other decided line, stays as on the computer.

## Examples

- Given a tool call waits on a phone, when you approve it at 10:44 and the run goes on,
  then the card reads "Approved by you at 10:44. Approval sent." and never "The run continues.".
- Given a wait step whose approve is labelled "Send reply" waits on a phone, when you press it at 10:44 and the run goes on,
  then the card reads "You chose Send reply at 10:44. Approval sent.".
- Given a tool call waits on a phone, when you approve it at 10:44 and that finishes the run,
  then the card reads "Approved by you at 10:44. The run finished.".
