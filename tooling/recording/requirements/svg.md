# recording.svg

- Status: active
- Since: 0.1.0
- Source: HAL-6422; the look and format of the README recording's storyboard on HAL-6395 (sections 4 and 5)

When a paced session is drawn, the renderer shall write an animated SVG that plays once and then rests on the session's last frame, and a still SVG of only that last frame, both in the website's dark code window with our status colours, and the animated SVG shall show only the last frame when the viewer has reduced motion on. A `{version}` in the recording's title shall be filled from the `<name>.version` the capture saved, never typed by hand.

## Examples

- Given a paced session that ends at the prompt after `halonic runs send`,
  when it is drawn,
  then every element's own style is the last frame and only the animation shows earlier frames, and the still holds just the last 24 rows.
- Given output in green and yellow,
  when it is drawn,
  then green is drawn in the success teal and yellow in the warning violet.
- Given output with the done mark "✓",
  when it is drawn,
  then the mark is a small check drawn in the same colour, not a text glyph, so it shows on systems whose monospace font lacks it.
- Given output with an escape code or colour the renderer doesn't know,
  when it is drawn,
  then it stops with an error that names it.
- Given a line wider than the recording's columns (80 for the first run),
  when it is drawn,
  then it stops with an error that names the line, instead of wrapping it.
- Given the title "Terminal · Halonic {version}" and a saved version "Halonic 0.1.0",
  when it is drawn,
  then the window bar says "Terminal · Halonic 0.1.0".
- Given a saved version that isn't "Halonic" and a version, or no saved version at all,
  when it is drawn,
  then it stops with an error that says what is missing.
