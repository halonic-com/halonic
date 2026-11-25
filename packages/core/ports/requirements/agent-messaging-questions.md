# ports.agent-messaging-questions

- Status: active
- Since: unreleased
- Source: HAL-18762 (board report on HAL-10: a card with three questions showed nothing to tick); plan approved by Liam

The `AgentMessaging` port shall let an inbox item ask several questions, each single- or multiple-select and required or not, in `questions`, set only when the item asks two or more questions or one answered with several options. An item with `questions` shall take only an `answers` answer, and every other item shall refuse one with `bad-answer`. An `answers` answer shall fit only when each question it names is asked by the item and named once, each option it picks is offered by that question and picked once, a single-select question has at most one option and a required question at least one.

## Examples

- Given an item asking a required single-select question `repo` and an optional multiple-select question `phase`,
  when it is answered with `separate` for `repo` and `tests` and `docs` for `phase`,
  then the answer fits.
- Given the same item,
  when it is answered with `phase` only, or with two options for `repo`, or with a question `colour` it doesn't ask,
  then the answer doesn't fit.
- Given an item with plain options and no `questions`,
  when it is given an `answers` answer,
  then the answer doesn't fit.
