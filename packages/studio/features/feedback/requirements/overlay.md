# feedback.overlay

- Status: active
- Since: unreleased
- Source: HAL-18970 (plan on HAL-18919); words and look from Sofia's sketch on HAL-18562, §1; Enter and the two-click box from HAL-19017

When a feedback overlay window opens, the Feedback feature shall draw that screen's still from
`plugin:feedback|still` under black at 40%, with a crosshair pointer and the hint
"Drag to select an area" · Enter "for the whole screen" · Esc "to cancel" at the top centre, shown
while the pointer is on that screen and hidden while a box is being drawn. While the person drags,
the feature shall show the box at full brightness, with a white edge and a dark one around it, and
its size label (`feedback.crop`). When the person lets go of a box of 8 × 8 logical pixels or
more, the feature shall call `plugin:feedback|select` with the box in the still's device pixels.
When the person lets go of a smaller box, the feature shall call nothing and keep the overlay open.
When the person presses Enter while no box is being drawn, the feature shall call
`plugin:feedback|select` with the whole still: left 0, top 0, and the still's width and height.
When the person clicks without dragging, the feature shall take the click as one corner of a box
that follows the pointer, at full brightness with its size label, until a second click sets the
opposite corner. When that box is 8 × 8 logical pixels or more, the feature shall call
`plugin:feedback|select` with it; when it is smaller, the feature shall call nothing and show the
hint again. When the person presses Esc, or the still is gone, the feature shall call
`plugin:feedback|end`.

## Examples

- Given an overlay of 100 × 50 CSS pixels whose still is 200 × 100,
  when the person drags from (10, 10) to (18, 18) and lets go,
  then the feature calls `plugin:feedback|select` with left 20, top 20, width 16 and height 16.
- Given an overlay whose still is 200 × 100,
  when the person presses Enter,
  then the feature calls `plugin:feedback|select` with left 0, top 0, width 200 and height 100.
- Given an overlay of 100 × 50 CSS pixels whose still is 200 × 100,
  when the person clicks at (10, 10), moves the pointer and clicks at (18, 18),
  then the feature calls `plugin:feedback|select` with left 20, top 20, width 16 and height 16.
- Given an open overlay,
  when the person drags a box of 7 × 30 and lets go,
  then nothing is called and the hint shows again.
- Given an open overlay,
  when the person presses Esc,
  then the feature calls `plugin:feedback|end`.
