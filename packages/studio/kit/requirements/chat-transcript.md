# kit.chat-transcript

- Status: active
- Since: unreleased
- Source: HAL-13177; states (HAL-5896) section 4, H8 and H12; flow-agents 4.2 and 4.4; HAL-11705; HAL-14103; HAL-14626

The kit's `ChatTranscript` shall show a chat's messages, oldest first, in a reading-width column that scrolls, as a region named by its `label` and not as a live region. It shall be one Tab stop with the focus ring, so a keyboard user can scroll it in every engine, WebKit included, when no message holds a button. While the reader is at its end, it shall stay at the end when the messages grow; when the reader has scrolled up, it shall leave the scroll where it is. When it has a `notice`, it shall show that sentence above the part that scrolls, on the LineFrame with the warning mark and under its `noticeId`, so a control that waits because of it can name it as its reason, keep showing the messages under it, and be described by the notice; the notice shall not cover the focus ring or any message.

## Examples

- Given a ChatTranscript whose messages hold no button,
  when the user presses Tab from the control before it,
  then the transcript takes the focus, shows the focus ring, and scrolls with the arrow keys.

- Given a ChatTranscript scrolled to its end,
  when a reply grows by a step,
  then it is scrolled to its new end.
- Given a ChatTranscript the reader has scrolled up,
  when a reply grows by a step,
  then its scroll doesn't move.
- Given a ChatTranscript with the notice "The engine isn't answering. Showing what it said last.",
  when it renders,
  then the notice shows above the messages, and the messages still show.
- Given a ChatTranscript with the notice "The engine isn't answering. Showing what it said last.",
  when it takes the focus,
  then the focus ring shows all the way round the part that scrolls, and the region is described by the notice.
