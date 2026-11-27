# paperclip-client.question-cards

- Status: active
- Since: unreleased
- Source: HAL-18762 (board report on HAL-10: a card with three questions showed nothing to tick); plan approved by Liam; task HAL-18788

The Paperclip provider shall map an `ask_user_questions` card that asks two or more questions, or any question with `selectionMode: "multi"` (Paperclip's multi-select), to an inbox item with `questions` and no `options`, each question keeping its ID, prompt, selection and options, and being required unless the card says `required: false`. A card with one single-select question shall keep its plain `options`. When the person answers such a card with an `answers` answer that fits its questions, the provider shall send Paperclip one `respondToCard` request with one entry per answered question, `{ questionId, optionIds }`, with the answer's text as `otherText`; it shall send nothing for an option, a reply or answers that don't fit. An answered card with questions shall read back as an `answers` answer that names every question's options and keeps its `otherText` as `text`.

## Examples

- Given a pending card with three questions, one of them multiple-select and optional,
  when the inbox is read,
  then the item has those three questions, the optional one not required, and no options.
- Given a pending card with one multiple-select question,
  when the inbox is read,
  then the item has that one question and no options.
- Given the three-question card,
  when the person answers `separate`, `tests` and `docs`, and `ada`,
  then Paperclip gets one `respondToCard` request with those `optionIds` for each question.
- Given the three-question card,
  when the person answers with an option, a reply, or only the first question,
  then nothing is sent and the answer is refused.
- Given the three-question card answered in Paperclip with `mono`, `tests` and `docs` with the text "And a demo", and `ada`,
  when the inbox is read,
  then the item's answer is an `answers` answer naming all of them, with "And a demo" as the second question's text.
