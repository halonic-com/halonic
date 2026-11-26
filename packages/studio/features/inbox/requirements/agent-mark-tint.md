# inbox.agent-mark-tint

- Status: active
- Since: unreleased
- Source: the board's rule "each agent keeps one colour everywhere" (HAL-19132, HAL-19134); Noah's visual check of the 26 Nov Studio merges (HAL-19905), fixed on HAL-19916

Where a row in Needs you starts with an agent's initials (`inbox.row-marks`), the Inbox shall draw them on the agent's own tint, picked from the agent's ID (`kit.agent-tint`), the same tint the Messenger gives that agent's chat. The agent's picture at the top of the open item shall take that tint too. The marks of approvals, person steps, setup items and questions shall stay neutral.

## Examples

- Given a card from Chief, whose agent ID is "agent-chief",
  when you open the Inbox,
  then Chief's row starts with "C" on the tint `agentTint("agent-chief")` gives, as Chief's chat in the Messenger.
- Given that card from Chief,
  when you open it,
  then its header shows "C" on the same tint as its row.
