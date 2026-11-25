# kit.question-form

- Status: active
- Since: unreleased
- Source: HAL-18762 plan, approved by Liam; HAL-18902; builds on HAL-17421 render 4e and the kit's Radio and Checkbox

The kit's `QuestionForm` shall show each of a card's questions as a `fieldset` whose `legend` is the question's prompt as plain text, followed by "(optional)" when the question isn't required, with a radio per option for a `single` question and a checkbox per option for a `multiple` one. Its **Submit** button shall be unavailable, described by "Answer each question to submit.", until every required question has a pick. When the person presses Submit, the kit shall call `onSubmit` once with one entry per question that has a pick, in the order asked, with its option IDs in the order offered. When the form is given `answered`, it shall keep each picked option ticked, make every radio and checkbox unavailable, and show "Answered ‹day›", such as "Answered 24 Nov", in place of Submit. `answerLabels` shall give the label of each option an answer picked, in the order answered, and an option's ID when the card no longer offers it.

## Examples

- Given a form with a required single question and an optional multiple one,
  when the person picks nothing,
  then Submit is unavailable and described by "Answer each question to submit.".
- Given the same form,
  when the person picks "Separate repo" and ticks "Dark" and "Compact", then presses Submit,
  then `onSubmit` gets `[{ question: "repo", options: ["separate"] }, { question: "look", options: ["dark", "compact"] }]`.
- Given the form answered on 24 Nov with "Separate repo" and "Dark",
  when it renders,
  then those two are ticked, every control is unavailable, and it says "Answered 24 Nov".
