# inbox.retry-focus

- Status: active
- Since: unreleased
- Source: HAL-15342; design check C560 (HAL-15312), a keyboard fix decided by the team (HAL-2282)

When you press **Try again** after a failed decision on the approval card (`inbox.approval-card`) or a failed answer on the wait card (`inbox.wait-card`), the card shall move focus to the button of the decision or answer it sends again, which reads "Approving…", "Rejecting…" or the answer's own busy label while it is sent. **Try again** leaves the alert slot while the answer is sent, so without this focus would fall to the page and the next Tab would start from the top. When the answer fails again, focus shall stay on that button, inside the card, with "Couldn't record your decision." and **Try again** back in the alert slot above it.

## Examples

- Given Approve on the approval card failed with "Couldn't record your decision." and **Try again**,
  when you focus **Try again** with the keyboard and press Enter,
  then **Approve** has focus and reads "Approving…" while the decision is sent, and when it fails again **Approve** still has focus.
- Given Reject on the wait card failed with "Couldn't record your decision." and **Try again**,
  when you press **Try again** with the keyboard,
  then **Reject** has focus while the answer is sent and after it fails again.
