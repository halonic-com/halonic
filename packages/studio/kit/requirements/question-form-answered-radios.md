# kit.question-form-answered-radios

- Status: active
- Since: unreleased
- Source: HAL-18946, Liam's review of #6246 (HAL-18902); builds on kit.question-form

When the kit's `QuestionForm` is given `answered`, each of its radios shall be described by the form's "Answered ‹day›" line, the same way its checkboxes are; when `answered` names the `id` of a line the card already shows about the answer, each radio shall be described by that line instead.

## Examples

- Given the form answered on 24 Nov with "Separate repo",
  when it renders,
  then "Separate repo" and "In the monorepo" are unavailable and described by "Answered 24 Nov".
- Given the same answer, with the card's own line "Answered at 18:43: Separate repo." named as `reason`,
  when it renders,
  then both radios are described by the card's line.
