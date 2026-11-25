# feedback.unavailable

- Status: active
- Since: unreleased
- Source: HAL-18970 (plan on HAL-18919); the sentence is checked by Sofia on HAL-18970

Where no screen still can be taken yet, such as on macOS or Linux on Wayland, the feedback
shortcut's window shall say "Studio can't take a screenshot for feedback on this system yet." with
a "Not now" button. When the person chooses "Not now" or presses Esc, the window shall call
`plugin:feedback|end`. The window shall never ask for a still.

## Examples

- Given Studio on Linux under Wayland,
  when the person presses Ctrl+Alt+F,
  then a small window says "Studio can't take a screenshot for feedback on this system yet."
- Given that window,
  when the person chooses "Not now",
  then it closes.
