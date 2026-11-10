# kit.tooltip

- Status: active
- Since: 0.1.0
- Source: HAL-2808, HAL-1289; base component specs 14 (Tooltip, and Kbd C13), 0.2 and 23 A7, A9

The kit's `Tooltip` shall be a `popover="manual"` element with `role="tooltip"`, an `fg` fill with `surface` text in `text-caption`, a 4px radius, 4px 8px padding and at most 240px wide, which never takes the pointer, and its control shall be described by it through `aria-describedby`, after an unavailable control's reason, except when the Tooltip is marked `isName`: its text is then the control's name and the control shall not be described by it. When a mouse or pen pointer has rested on the control for 500ms, or the control gets keyboard focus, the kit shall show the tooltip, centred under the control by the positioning helper (`kit.popover-position`). When the pointer leaves, the control loses focus or the user presses Escape, the kit shall hide it, and that Escape shall go no further. When the user presses the control, the kit shall hide it and not show it again until the pointer has left the control. On touch the kit shall not show it. When the tooltip has `keys`, it shall show them 8px after its text as plain `font-mono` `text-caption` keys 6px apart, without the Kbd's box, and the control shall name them with `aria-keyshortcuts`.

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
- Given a control with its Tooltip shown after hover,
  when the user clicks it and keeps the pointer on it,
  then the tooltip hides and doesn't show again until the pointer leaves and comes back.
- Given an icon button named "New tab" with the Tooltip "New tab" marked `isName`,
  when it renders,
  then the button has no `aria-describedby`.
- Given a Tooltip "New tab" with the keys Ctrl and T,
  when it renders,
  then the control has `aria-keyshortcuts="Control+T"` and the keys show without a box.
