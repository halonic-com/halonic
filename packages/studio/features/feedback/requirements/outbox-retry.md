# feedback.outbox-retry

- Status: active
- Since: unreleased
- Source: HAL-18737 (Liam's review notes on PR 1 of HAL-18563)

The Feedback feature shall give each feedback one ID when it is sent and send every later try of it
with that same ID, so Paperclip makes one task for it however many times a reply is lost. While
feedback waits, the feature shall keep each screenshot with its feedback, under the feedback's ID,
read no screenshot when it lists the waiting feedback, and delete the feedback and its screenshot
in one step once the feedback is sent, given up, or dropped by `feedback.outbox-cap`. Feedback sent while other feedback waits does
not wait for it, so its task can be created before theirs.

## Examples

- Given feedback whose task Paperclip made but whose reply was lost,
  when the waiting feedback is sent again,
  then it goes with the same ID and the same screenshot, and only one task exists.
- Given one waiting feedback with a screenshot and one without,
  when the waiting feedback is listed,
  then the list holds no image bytes, and one screenshot is kept.
- Given that feedback sent,
  when the waiting feedback is sent,
  then no screenshot is left.
