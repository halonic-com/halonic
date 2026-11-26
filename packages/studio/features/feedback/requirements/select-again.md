# feedback.select-again

- Status: active
- Since: unreleased
- Source: HAL-19241, C3 of HAL-18563 (board request on HAL-10), on the Send feedback dialog in the window (`feedback.send-window`, HAL-19528); HAL-19010, condition 4; Noah's design check on HAL-19208 and Nina's words check on HAL-19210; sketch on HAL-18562, §2

When the shell answers a press with a still, the Feedback feature shall note the app and the window
from the title of the window the shortcut was pressed in: the title's last part, when it starts
with "Halonic", is the app and the rest is the window, so the app's name shows once; any other
title is all window, with "Halonic" as the app. Under the crop, the Send feedback dialog shall show
"{App} · {Window title} · {W} × {H}", leaving out an empty part, and the feature shall put the app
and window in the task. At the right of that line, while nothing is being sent and the crop
loaded, a text button "Select again" shall close the dialog, keeping the text typed, and once the
window has drawn without the dialog call `plugin:feedback|start` as a press does; the dialog after
the next selection shall open with that text. When the shell gives no still then, the feature
shall show the dialog again with the text. Tab shall go from the text to "Select again", then
Cancel, then Send.

## Examples

- Given Studio's window "Runs · Acme · Halonic" and a 20 × 10 crop,
  when the Send feedback dialog opens,
  then the line under the crop reads "Halonic · Runs · Acme · 20 × 10".
- Given Halonic Messenger's window "Messenger · Acme · Halonic Messenger",
  when the shortcut is pressed in it,
  then the app is "Halonic Messenger" and the window "Messenger · Acme".
- Given "Run list jumps" typed,
  when the person presses "Select again" and selects a new box,
  then the dialog opens again with "Run list jumps", and the feedback never ended.
- Given "Run list jumps" typed,
  when the person presses "Select again" and the shell answers `busy`,
  then the dialog shows again with "Run list jumps".
