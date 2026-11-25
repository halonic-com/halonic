# ports.agent-messaging-answer-elsewhere

- Status: active
- Since: unreleased
- Source: HAL-18861 (board ask on HAL-10: no dead cards in Inbox and Messenger); proposal approved by Liam on HAL-18871

The `AgentMessaging` port shall let a source mark an inbox item it can't take an answer to with `answerElsewhere`, a link to where it is answered, such as the task's page in Paperclip. Such an item shall take no answer, and every `AgentMessaging` shall refuse one with `bad-answer`. An item shall hold together only when its `answerElsewhere` link is an `https:` address.

## Examples

- Given an item with `answerElsewhere`,
  when it is given a reply, an option or an `answers` answer,
  then the answer doesn't fit.
- Given an item whose `answerElsewhere` link is `http:`, `javascript:` or a bare path,
  when it is checked,
  then it doesn't hold together.
