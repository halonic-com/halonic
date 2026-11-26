# feedback.outbox-windows

- Status: active
- Since: unreleased
- Source: HAL-19240; Liam's conditions 2 and 3 on HAL-19671 (every Studio window shares the one outbox)

The Feedback feature shall keep a feedback to send later, and send the waiting feedback, while no
other Studio window's outbox does either, through the lock `halonic-feedback-outbox`, so a waiting
feedback is sent once however many windows send at the same time, and the cap of
`feedback.outbox-cap` holds when two windows keep feedback at once. The feature shall keep each
waiting feedback with the folder and Paperclip connection it was written for, and shall send it
only through that same folder's connection; feedback for another one shall keep waiting.

## Examples

- Given one waiting feedback and two Studio windows,
  when both send the waiting feedback at the same time,
  then it is sent once.
- Given 49 feedbacks waiting,
  when two windows each keep one at the same time,
  then 50 wait and the oldest is dropped.
- Given one feedback waiting for Acme's connection and one for Globex's,
  when Acme's window sends the waiting feedback,
  then only Acme's is sent, and Globex's keeps waiting.
