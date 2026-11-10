# kit.popover-position

- Status: active
- Since: 0.1.0
- Source: HAL-2808, HAL-1289; base component specs 14 (Menu, "v0.1 build")

The kit's positioning helper shall place a popover below its trigger, lined up with the trigger's left edge, or its right edge when asked. When the popover doesn't fit below, the helper shall place it above. When it doesn't fit next to the asked edge, the helper shall line it up with the other edge. The helper shall keep the popover at least 8px from the window's edges, and when it fits neither below nor above, it shall take the side with more room and limit the popover's height to that room.

## Examples

- Given a 200×150 popover and a 32px trigger at 100, 100 in an 800×600 window,
  when it is placed with a 4px gap,
  then it goes at top 136, left 100.
- Given the same popover and a trigger at 100, 500,
  when it is placed,
  then it goes above, at top 346.
- Given a 500px tall popover and a trigger at 100, 200,
  when it is placed,
  then it goes below with a maximum height of 356.
