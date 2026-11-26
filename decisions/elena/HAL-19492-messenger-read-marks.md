# Decision: a Messenger row's count follows the chat's read mark

- Approval: https://paperclip.ing/HAL/issues/HAL-19492
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:bV3zXP6TU/Bo1edBgbM7rlRCnmE4s5AwISYUVQFndzESlVjes460fD3+cwh0zb3l9bdsNX52M7rzARkmuvDIDg==

`messenger.chat-rows` counted the agent's messages that came after the person last had the chat
open, and showed no count once it was open. The read and unread rule the board approved on
HAL-19192 adds Mark as read, which clears a count without opening the chat, and Mark as unread,
which gives an opened chat its count back. So the count now follows the chat's read mark
(`messenger.read-marks`), and the row still shows no count while the chat is open. Opening a chat
moves its read mark, so a chat that was opened and not marked unread still shows no count, as
before. The plan was approved by Liam on HAL-19492; Julian reviewed it on the pull request.

## Covers

- messenger.chat-rows
