# contracts.agent-messaging-questions

- Status: active
- Since: unreleased
- Source: HAL-18762 (board report on HAL-10: a card with three questions showed nothing to tick); plan approved by Liam

The `AgentMessaging` contract shall pass for every `AgentMessaging`, whatever carries it, for an item that asks several questions: an option answer to it shall be refused with `bad-answer`, an `answers` answer to an item without questions shall be refused with `bad-answer`, and an `answers` answer that fits shall answer it, after which the item shall list with its questions and that answer.

## Examples

- Given an item asking two questions over the server's messaging routes,
  when it is answered with one option, or a plain item is answered with `answers`,
  then the result is refused with `bad-answer`.
- Given the same item,
  when it is answered with `answers` that fit,
  then the result is `answered`, and the item lists with its questions and that answer.
