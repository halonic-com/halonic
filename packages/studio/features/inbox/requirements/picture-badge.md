# inbox.picture-badge

- Status: active
- Since: unreleased
- Source: Sofia's proposal on HAL-19491, parts (a) to (c), approved by the board on 26 Nov; built on HAL-19666

Where a row in Needs you, or the open item's header, holds an agent's item, the Inbox shall show who asks as the picture and what kind of item it is as a badge on it (`kit.avatar-badge`). The picture shall be the asking agent's own picture, read once while the Inbox is open, or while it is missing or can't be read the agent's initial on its own tint (`inbox.agent-mark-tint`); a person's initials on the neutral tile; or a silhouette for a sender the source doesn't name. The badge shall follow the item's kind (`ports.agent-messaging-item-kind`): a stamp for an approval, a "?" for a question, steps for an action, an arrow out for an item answered elsewhere, a sheet for a task and a speech bubble for a comment. The Inbox's own approvals, person steps and setup items shall keep their stamp, pause and gear, with no badge.

## Examples

- Given Liam, who has a picture, asking to approve "Merge #12?",
  when you open the Inbox,
  then its row shows Liam's picture with a stamp badge.
- Given Chief, without a picture, asking "Which hostname?" with no kind set,
  when you open the Inbox,
  then its row shows "C" on Chief's tint with a "?" badge.
- Given a person step,
  when you open the Inbox,
  then its row shows a pause with no badge.
