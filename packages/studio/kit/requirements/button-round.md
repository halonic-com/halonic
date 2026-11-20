# kit.button-round

- Status: active
- Since: unreleased
- Source: HAL-13772 (C234 TC1, Sofia's decision on a detail of the approved Tools page); base component specs 23.5

When an icon `Button` is given `round`, the kit shall draw it as a circle instead of a square, at the same size, so the ✕ at the end of a round chip has an edge in high contrast and a hover fill that follow the chip's round end. Every other button shall keep its small square corners, and `round` shall not be accepted on a button with words.

## Examples

- Given `<Button variant="ghost" size="sm" round icon={…} label="Remove Refund policy" />`,
  when it renders,
  then its classes include `rounded-full` and `size-control-sm`, and not `rounded-sm`.
- Given `<Button variant="ghost" icon={…} label="Close" />`,
  when it renders,
  then its classes include `rounded-sm`, and not `rounded-full`.
