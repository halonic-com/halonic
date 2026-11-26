# feedback.overlay

- Status: active
- Since: unreleased
- Source: HAL-18970 (plan on HAL-18919); words and look from Sofia's sketch on HAL-18562, §1

When a feedback overlay window opens, the Feedback feature shall draw that screen's still from
`plugin:feedback|still` under black at 40%, with a crosshair pointer and the hint
"Drag to select an area" · Esc "to cancel" at the top centre, shown while the pointer is on that
screen and hidden once a drag starts. While the person drags, the feature shall show the box at
full brightness, with a white edge and a dark one around it, and its size label (`feedback.crop`).
When the person lets go of a box of 8 × 8 logical pixels or more, the feature shall call
`plugin:feedback|select` with the box in the still's device pixels. When the person lets go of a
smaller box or clicks, the feature shall call nothing and keep the overlay open. When the person
presses Esc, or the still is gone, the feature shall call `plugin:feedback|end`.

## Examples

- Given an overlay of 100 × 50 CSS pixels whose still is 200 × 100,
  when the person drags from (10, 10) to (18, 18) and lets go,
  then the feature calls `plugin:feedback|select` with left 20, top 20, width 16 and height 16.
- Given an open overlay,
  when the person drags a box of 7 × 30 and lets go,
  then nothing is called and the hint shows again.
- Given an open overlay,
  when the person presses Esc,
  then the feature calls `plugin:feedback|end`.
