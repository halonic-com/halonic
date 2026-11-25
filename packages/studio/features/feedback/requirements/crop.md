# feedback.crop

- Status: active
- Since: unreleased
- Source: HAL-18563 (board's go-ahead on HAL-10); details from Sofia's sketch on HAL-18562

While the person drags on the selection overlay, the Feedback feature shall keep the box on the
screen where the drag started, pinning it to that screen's edge when the pointer leaves it. When
the box is smaller than 8 × 8 logical pixels, the feature shall treat it as no selection and keep
the overlay open. When the box is a selection, the feature shall crop the screen's still in device
pixels, rounding the box's edges outwards and staying inside the still, and shall label its size as
"{width} × {height}" in those device pixels. The label shall sit below the box's bottom-right
corner, and inside the box when it would leave the screen there.

## Examples

- Given a Retina screen at scale 2 and a box of 640 × 330 logical pixels,
  when the person lets go,
  then the crop is 1280 × 660 device pixels and the label reads "1280 × 660".
- Given a drag that starts on the left screen and ends on the right one,
  when the box is drawn,
  then it ends at the left screen's right edge.
- Given a click with no drag, or a box of 5 × 40,
  when the person lets go,
  then nothing is selected and the overlay stays open.
