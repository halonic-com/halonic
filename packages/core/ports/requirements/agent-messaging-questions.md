# ports.agent-messaging-questions

- Status: active
- Since: unreleased
- Source: HAL-18762 (board report on HAL-10: a card with three questions showed nothing to tick); plan approved by Liam

The `AgentMessaging` port shall let an inbox item ask several questions, each single- or multiple-select and required or not, in `questions`, set only when the item asks two or more questions or one answered with several options. An item with `questions` shall take an `answers` answer, or an option answer naming one of its `options`, which then hold only whole-item choices such as Reject; every item without `questions` shall refuse an `answers` answer with `bad-answer`. An option marked `noteRequired` shall be taken only with a note that isn't blank. A question's `preselected` options, which apps tick before the person answers, shall be options it offers, each once, and at most one for a single-select question. An `answers` answer shall fit only when each question it names is asked by the item and named once, each option it picks is offered by that question and picked once, a single-select question has at most one option and a required question at least one.

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
- Given an item with questions and a `reject` option that needs a note,
  when it is answered `reject` with "Not this week", or with no note, or with another option,
  then only the first fits.
- Given a single-select question with two `preselected` options, or one it doesn't offer,
  when the item is checked,
  then it doesn't hold together.
