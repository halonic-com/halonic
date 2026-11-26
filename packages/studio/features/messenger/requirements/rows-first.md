# messenger.rows-first

- Status: active
- Since: unreleased
- Source: HAL-19822 (finding B of the board's quick ask check on HAL-19376: the agent list took about 40 s after Paperclip connected, because the list waited for a first Inbox read of every open task's cards)

When the Messenger reads its list, it shall read the sources, the agents, the conversations and the Inbox once each, and every conversation's messages at the same time, and it shall show the list without waiting for the Inbox: each row's violet dot and a channel's questions shall come from the last Inbox read that answered. When an Inbox read answers after the list was shown, with cards other than those the list showed, the Messenger shall read its list again. While an Inbox read is under way, the list, "Needs you" and a channel's questions shall share it. If an Inbox read fails, the list shall still show, without its dots.

## Examples

- Given 15 agents, each with a chat, and a Paperclip whose first Inbox read takes 40 s,
  when the board opens the Messenger or the quick ask box,
  then the 15 chats show once their messages are read, without waiting 40 s.
- Given the same list shown before the Inbox read answered,
  when it answers with a card from Chief,
  then the Messenger reads its list again and Chief's row shows the violet dot.
- Given the list and "Needs you" open together,
  when both read the Inbox,
  then the Inbox is read once.
