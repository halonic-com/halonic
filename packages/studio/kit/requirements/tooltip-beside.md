# kit.tooltip-beside

- Status: active
- Since: unreleased
- Source: HAL-20675; Noah's part recipes (HAL-20672), the rail button's name

Where a `Tooltip` is asked to sit `beside` its control, the kit shall place it 4px after the control's end edge, before its left edge right to left, centred on the control top to bottom in whole pixels. When it doesn't fit on that side, the kit shall place it on the other side, and it shall keep the tooltip at least 8px from the edges of the window. It shall show and hide as every Tooltip does (`kit.tooltip`).

## Examples

- Given a 40px control at the window's left edge with the Tooltip "Library" beside it,
  when the tooltip shows,
  then its left edge is 4px right of the control and its middle is level with the control's.
- Given the same control right to left at the window's right edge,
  when the tooltip shows,
  then it sits 4px left of the control.
