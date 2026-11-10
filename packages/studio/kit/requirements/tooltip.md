# kit.tooltip

- Status: active
- Since: 0.1.0
- Source: HAL-2808, HAL-1289; base component specs 14 (Tooltip, and Kbd C13), 0.2 and 23 A7, A9

The kit's `Tooltip` shall be a `popover="manual"` element with `role="tooltip"`, an `fg` fill with `surface` text in `text-caption`, a 4px radius, 4px 8px padding and at most 240px wide, which never takes the pointer, and its control shall be described by it through `aria-describedby`, after an unavailable control's reason. When a mouse or pen pointer has rested on the control for 500ms, or the control gets keyboard focus, the kit shall show the tooltip, placed with the positioning helper (`kit.popover-position`). When the pointer leaves, the control loses focus or the user presses Escape, the kit shall hide it, and that Escape shall go no further. On touch the kit shall not show it. When the tooltip has `keys`, it shall show them 8px after its text as plain `font-mono` `text-caption` keys 6px apart, without the Kbd's box, and the control shall name them with `aria-keyshortcuts`.

## Examples

- Given a control with the Tooltip "New tab",
  when a mouse pointer rests on it for 499ms,
  then the tooltip isn't shown; at 500ms it is.
- Given a control with a Tooltip, on a touch screen,
  when the user's finger rests on it for 500ms,
  then the tooltip isn't shown.
- Given a focused control with its Tooltip shown, inside a Dialog,
  when the user presses Escape,
  then the tooltip hides and the Dialog stays open.
- Given a Tooltip "New tab" with the keys Ctrl and T,
  when it renders,
  then the control has `aria-keyshortcuts="Control+T"` and the keys show without a box.
