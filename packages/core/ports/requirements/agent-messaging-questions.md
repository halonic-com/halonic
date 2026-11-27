# ports.agent-messaging-questions

- Status: active
- Since: unreleased
- Source: HAL-18762 (board report on HAL-10: a card with three questions showed nothing to tick); written answers HAL-20648; plans approved by Liam

The `AgentMessaging` port shall let an inbox item ask several questions, each single- or multiple-select and required or not, in `questions`, set only when the item asks two or more questions or one answered with several options or in writing. An item with `questions` shall take an `answers` answer, or an option answer naming one of its `options`, which then hold only whole-item choices such as Reject; every item without `questions` shall refuse an `answers` answer with `bad-answer`. An option marked `noteRequired` shall be taken only with a note that isn't blank. A question's `preselected` options, which apps tick before the person answers, shall be options it offers, each once, and at most one for a single-select question. An `answers` answer shall fit only when each question it names is asked by the item and named once, each option it picks is offered by that question and picked once, a single-select question has at most one option and a required question at least one, or "Other" text that isn't blank. A question may take a written answer, in the answer's `text`: by `allowOther`, an extra "Other" choice, or by options marked `freeText`. Since the text can't say which choice it belongs to, a question shall take at most one written-text choice: the text shall belong to the picked `freeText` option when there is one, and the answer shall not fit with two `freeText` options picked or with a picked one's text blank. Otherwise, for a question with `allowOther`, the text is its "Other" answer, which shall fit a single-select question only with no option picked; "Other" text that is blank after trimming shall count as no answer. A question with neither shall keep the text as its source's own note, such as a verdict's reason.

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
- Given a required single-select question `repo` that allows Other,
  when it is answered with no option and "A fork", or with no option and blank text, or with `mono` and "A fork",
  then only the first fits; with no option, "A fork" doesn't answer a required question that doesn't allow Other.
- Given a multiple-select question whose options `tests` and `other` are both `freeText`,
  when it is answered `tests` with "Load tests", or `tests` with no text or blank text, or `tests` and `other` with "A demo",
  then only the first fits.
