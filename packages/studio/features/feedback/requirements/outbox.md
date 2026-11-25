# feedback.outbox

- Status: active
- Since: unreleased
- Source: HAL-18563 (board's go-ahead on HAL-10); details from Sofia's sketch on HAL-18562

When Studio is offline or not connected to Paperclip as feedback is sent, the Feedback feature
shall keep it, with its screenshot, and say whether it waits to be online or to be connected. When
the connection comes back, the feature shall send the waiting feedback oldest first, stop at the
first that finds no connection, and report each task it created. When Paperclip refuses a waiting
feedback three times, the feature shall stop trying and report it with Paperclip's reason. When 50
feedbacks are waiting, the feature shall keep no more and say so. Feedback kept while waiting
feedback is being sent shall never be lost.

## Examples

- Given Studio is offline,
  when the person sends feedback,
  then it is kept and "1 waiting to send" can be shown.
- Given two feedbacks waiting and Studio back online,
  when the waiting feedback is sent,
  then both tasks are created, the older one first, and none wait.
- Given a feedback Paperclip refuses,
  when it has been refused three times,
  then it no longer waits and its refusal is reported.
