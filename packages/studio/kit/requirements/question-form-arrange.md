# kit.question-form-arrange

- Status: active
- Since: unreleased
- Source: HAL-21255, so an Inbox agent's card can keep **Submit** in a foot that never scrolls while its questions scroll; builds on kit.question-form

Where a caller gives the kit's `QuestionForm` an `arrange`, the form shall hand it the questions and the **Submit** row as two separate parts, take no box of its own, and still send the picks when the person presses that **Submit**, wherever the caller placed it. Once the form is answered, the **Submit** part shall be empty.

## Examples

- Given a form with `arrange` placing the questions in a body and Submit in a foot,
  when the person picks an answer and presses Submit,
  then the foot holds Submit and no question, and `onSubmit` gets the pick.
- Given an answered form with `arrange`,
  when it renders,
  then the Submit part is empty and "Answered 24 Nov" shows with the questions.
