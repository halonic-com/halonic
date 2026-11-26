# feedback.overlay

- Status: active
- Since: unreleased
- Source: HAL-18970 (plan on HAL-18919); inside the window and see-through from the board (26 Nov); words and look from Sofia's sketch on HAL-18562, §1; Enter and the two-click box from HAL-19017; above an open modal from the board (26 Nov, HAL-19757)

When the feedback starts in one of Studio's windows (`feedback.in-app`), the Feedback feature shall
show the selection overlay inside that window only, over the live app: see-through, under black at
25%, with a crosshair pointer and the hint "Drag to select an area" · Enter "for the whole window" ·
Esc "to cancel" at the top centre, shown while the pointer is in the window and hidden while a box is
being drawn. While the person drags, the feature shall show the box at full brightness, with a white
edge and a dark one around it, and its size label (`feedback.crop`). When the person lets go of a box
of 8 × 8 logical pixels or more, the feature shall take the overlay away and call
`plugin:feedback|select` with the box in the device pixels of the still the shell took of the
window. When the person lets go of a smaller box, the feature shall call nothing and keep the overlay
open. When the person presses Enter while no box is being drawn, the feature shall take the overlay
away and call `plugin:feedback|select` with the whole still: left 0, top 0, and the still's width and
height. When the person clicks without dragging, the feature shall take the click as one corner of a
box that follows the pointer, at full brightness with its size label, until a second click sets the
opposite corner. When that box is 8 × 8 logical pixels or more, the feature shall select it as
above; when it is smaller, the feature shall call nothing and show the hint again. When the shell
refuses the box, the feature shall call `plugin:feedback|end`, unless it refuses it as
`other_window` because another window's press took the still since. When the person presses Esc, the feature shall take the overlay away and call `plugin:feedback|end`. Enter and Esc
shall not reach the app under the overlay.
While a modal of the app is open in that window, the feature shall show the overlay above it, and
the modal shall take no pointer or key until the overlay is taken away.

## Examples

- Given a window of 100 × 50 CSS pixels whose still is 200 × 100,
  when the person drags from (10, 10) to (18, 18) and lets go,
  then the feature calls `plugin:feedback|select` with left 20, top 20, width 16 and height 16.
- Given a window whose still is 200 × 100,
  when the person presses Enter,
  then the feature calls `plugin:feedback|select` with left 0, top 0, width 200 and height 100.
- Given a window of 100 × 50 CSS pixels whose still is 200 × 100,
  when the person clicks at (10, 10), moves the pointer and clicks at (18, 18),
  then the feature calls `plugin:feedback|select` with left 20, top 20, width 16 and height 16.
- Given an open overlay,
  when the person drags a box of 7 × 30 and lets go,
  then nothing is called and the hint shows again.
- Given an open overlay,
  when the person presses Esc,
  then the feature calls `plugin:feedback|end`.
- Given a modal open in Studio's window,
  when the person presses the feedback shortcut,
  then the overlay shows above the modal.
