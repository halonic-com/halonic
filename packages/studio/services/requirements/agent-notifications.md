# services.agent-notifications

- Status: active
- Since: unreleased
- Source: HAL-17448; HAL-17422 plan, approved by the board on HAL-10 (24 Nov): notifications on for new cards, questions and an agent finishing what was asked, off for other replies, and a notification only opens Studio, never approves. Notification dependency approved on HAL-17434.

When `AgentMessaging` reports a change, the Studio shall read again and show one desktop notification for each new open inbox item, each conversation that starts waiting for the person, and each piece of work that moves to `done` and that the person asked for by answering an inbox item about it. It shall show none for any other change, such as a reply while a conversation already waits, and none for what is there when it starts. Clicking a notification shall only open its item in Studio, never answer it or send a message.

## Examples

- Given Studio is open with the Paperclip source,
  when Liam puts a new card in the inbox,
  then one notification "New card from Liam" shows.
- Given a conversation with Chief that already waits for the person,
  when Chief sends one more message,
  then no notification shows.
- Given the person answered a card about HAL-1,
  when HAL-1 moves to done,
  then one notification "Done: HAL-1" shows.
- Given a notification for a card,
  when the person clicks it,
  then Studio opens the card, and nothing is answered or sent.
