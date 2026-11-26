# feedback.outbox-cap

- Status: active
- Since: unreleased
- Source: HAL-18971 (Liam's conditions on HAL-19010 and on the plan on HAL-18919)

When the Feedback feature keeps a feedback to send later and that would make more than 50
feedbacks wait, or their screenshots more than 100 MB, the feature shall drop the oldest waiting
feedback, with its screenshot, until the new one fits, and report each one it drops so that Studio
logs it. The new feedback is always kept.

## Examples

- Given 50 feedbacks waiting,
  when one more is kept,
  then the oldest is dropped and reported, and 50 wait.
- Given waiting screenshots of 75 MB and a new one of 25 MB and a byte,
  when it is kept,
  then the oldest feedback is dropped with its screenshot.
