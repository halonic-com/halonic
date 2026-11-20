# kit.chat-transcript

- Status: active
- Since: 0.1.0
- Source: HAL-13177; states (HAL-5896) section 4, H8 and H12; flow-agents 4.2 and 4.4; HAL-11705; HAL-14103

The kit's `ChatTranscript` shall show a chat's messages, oldest first, in a reading-width column that scrolls, as a region named by its `label` and not as a live region. It shall be one Tab stop with the focus ring, so a keyboard user can scroll it in every engine, WebKit included, when no message holds a button. While the reader is at its end, it shall stay at the end when the messages grow; when the reader has scrolled up, it shall leave the scroll where it is. When it has a `notice`, it shall show that sentence at the top, on the LineFrame with the warning mark and under its `noticeId`, so a control that waits because of it can name it as its reason, and keep showing the messages under it, with its scroll padded at the top by the notice's height, so a control scrolled into view as it takes focus isn't hidden under the notice.

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
- Given a ChatTranscript with a notice 57 pixels high,
  when it renders,
  then its scroll padding at the top is 57 pixels.
