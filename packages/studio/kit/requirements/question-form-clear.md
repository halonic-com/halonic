# kit.question-form-clear

- Status: active
- Since: unreleased
- Source: HAL-18946, Liam's review of #6246 (HAL-18902); wording checked by Noah on HAL-18956; builds on kit.question-form

While an optional `single` question in the kit's `QuestionForm` has a pick and the form isn't answered, the form shall show a **Clear answer** button under its radios, named "Clear answer to ‹prompt›" for screen readers. When the person presses it, the kit shall unpick that question's radio and move the focus to its first radio, and Submit shall then send no entry for that question.

## Examples

- Given an optional single question "When?" with "Later" picked,
  when the person presses Clear answer, then Submit,
  then neither radio is picked and `onSubmit` gets no entry for "When?".
- Given a required single question with a pick,
  when the form renders,
  then it shows no Clear answer button for it.
