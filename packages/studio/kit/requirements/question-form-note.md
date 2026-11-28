# kit.question-form-note

- Status: active
- Since: unreleased
- Source: HAL-20649 (found for HAL-19002: no item of a verdict card could be rejected); plan approved by Liam; builds on kit.question-form

While an option that takes a note (`noteRequired` or `noteLabel`) is picked in the kit's `QuestionForm`, the form shall show a text field under that question, labelled with the option's `noteLabel`, else its label. While a picked option's required note is blank, Submit shall be unavailable, described by "Answer each question to submit.". When the person presses Submit, the kit shall send the note, trimmed, as that question's `text`. When the person picks another option, the kit shall drop the note written for the one before, so it is never sent. When the form is given `answered`, it shall show each answer's `text` in its note field, read-only.

## Examples

- Given a verdict question with Approve and Reject, Reject needing a note labelled "Why are you rejecting this?",
  when the person picks Reject,
  then the field "Why are you rejecting this?" shows and Submit is unavailable until it holds text.
- Given that question,
  when the person picks Reject, writes "Add the install step" and presses Submit,
  then `onSubmit` gets `[{ question: "intro", options: ["reject"], text: "Add the install step" }]`.
- Given that question with Reject picked and a note written,
  when the person picks Approve and presses Submit,
  then `onSubmit` gets no `text`, and picking Reject again shows an empty field.
