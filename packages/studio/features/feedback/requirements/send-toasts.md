# feedback.send-toasts

- Status: active
- Since: unreleased
- Source: HAL-18971 (plan on HAL-18919); words from Sofia's sketch on HAL-18562, §3

When a feedback is sent, the Feedback feature shall show the success toast "Feedback sent" with
the line "{task ID} · {task title}" and the action "Open task", which opens the task's page. When
a feedback is kept because Studio is offline, the feature shall show the info toast "Feedback
saved" with "It sends by itself once Studio is back online.", and when it is kept because Studio
isn't connected to Paperclip, with "It sends by itself once Studio is connected to Paperclip."
When the person cancels with text typed, the feature shall show the info toast "Feedback
discarded" with the action "Undo".

## Examples

- Given a feedback Paperclip made as ACME-12, titled "Run list jumps",
  when the toast shows,
  then it reads "Feedback sent", "ACME-12 · Run list jumps" and "Open task".
- Given Studio offline,
  when the person sends feedback,
  then the toast reads "Feedback saved" and "It sends by itself once Studio is back online."
