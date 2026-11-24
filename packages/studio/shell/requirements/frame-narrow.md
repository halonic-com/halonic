# shell.frame-narrow

- Status: active
- Since: unreleased
- Source: HAL-17822; a11y check 2, row Z2 (HAL-12633); HAL-12667 option 1

The shell's frame shall tell the parts inside it, through the kit's `NarrowProvider`, whether the window is narrower than `WIDE_MIN_WIDTH` (900px), a phone included, and shall follow every change of the width without a reload. The presentation shall stay as `shell.frame` says, so a narrow desktop window keeps the desktop's components.

## Examples

- Given a 1280 × 800 window,
  when it is zoomed to 200 % (640 × 400 CSS px),
  then the frame says the window is narrow, and the presentation stays `desktop`.
- Given a 390 × 844 phone,
  then the frame says the window is narrow, and the presentation is `phone`.
- Given a window 900px wide,
  then the frame says the window is not narrow.
