# recording.pacing

- Status: active
- Since: 0.1.0
- Source: HAL-6422; the shot table of the README recording's storyboard on HAL-6395 (section 2)

When a capture is paced, the pacing shall change only when things appear: each command is typed over its `typing` seconds, the prompt rests for its `hold` seconds, and a wait before a command's first output longer than its `maxWaitForOutput` is cut to it, while every output text and the gaps inside a command's output stay as captured.

## Examples

- Given a capture where `halonic init` printed 1.4 s after Enter and a pacing with `maxWaitForOutput` 0.3,
  when the capture is paced,
  then its output appears 0.3 s after Enter, with the same text.
- Given a command typed with `typing` 1.6,
  when the capture is paced,
  then its characters appear one by one, unevenly, and Enter comes 1.6 s after the first character.
- Given a capture whose echoed line differs from its marker,
  when the capture is paced,
  then it stops with an error.
