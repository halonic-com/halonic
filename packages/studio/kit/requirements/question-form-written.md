# kit.question-form-written

- Status: active
- Since: unreleased
- Source: HAL-20648 (Paperclip's "Other" and free-text answers, found for HAL-19002); plan approved by Liam on HAL-20735; builds on kit.question-form and ports.agent-messaging-questions

When a question in the kit's `QuestionForm` has `allowOther`, the form shall offer an extra choice "Other" after its options, a radio for a `single` question and a checkbox for a `multiple` one. While the question's "Other" or an option marked `freeText` is picked, the form shall show a text field labelled "Your answer" under its choices, and Submit shall be unavailable, described by "Answer each question to submit.", while that field is blank. When the person presses Submit, that question's entry shall carry the written answer, trimmed, as `text`, with no option for "Other". A question shall have at most one written-text choice picked: ticking "Other" or a `freeText` option shall untick any other. When the form is given `answered` with a question's `text`, it shall show "Other" picked when no `freeText` option is, and the text in a field that is unavailable. `answerLabels` shall give an entry's written answer after its option labels.

## Examples

- Given a required single question that allows Other,
  when the person picks Other, writes "A fork of the app" and presses Submit,
  then `onSubmit` gets `[{ question: "repo", options: [], text: "A fork of the app" }]`; with the field blank, Submit is unavailable.
- Given a multiple question that allows Other and has a `freeText` option "Tests, namely…",
  when the person ticks Docs and Other, then "Tests, namely…", writes "Load tests" and presses Submit,
  then Other is unticked and the entry is `{ question: "phase", options: ["docs", "tests"], text: "Load tests" }`.
- Given the form answered with "A fork of the app" as repo's text,
  when it renders,
  then Other is picked and the field shows that text and is unavailable, and `answerLabels` gives "A fork of the app".
