# kit.status-chip

- Status: active
- Since: 0.1.0
- Source: HAL-1289, HAL-1563, HAL-14377; base component specs 10 and 23.5

The kit's `StatusChip` shall render a word or a count as a non-interactive element in one of seven tones (`neutral`, `accent`, `running`, `warning`, `danger`, `success`, and `outline` for a tag), each coloured tone being its colour on its own soft fill. Inside a muted fill (`data-fill="muted"`, or a hovered or pressed `data-hover-fill="muted"`), a `neutral` chip shall take the `border` fill with `fg` text, and a coloured tone with a see-through soft fill shall lay that fill over `surface`, so its text keeps 4.5:1 there. When a chip has `dot`, the kit shall draw a still 6px dot in the text colour before the word, hidden from screen readers, and in high contrast in `CanvasText`, the colour high contrast gives the chip's words. When its `shape` is `count`, the kit shall draw it round with tabular figures, require a `name` in words ("3 waiting"), hide the number from screen readers and follow it with the hidden text ", {name}", so the item it sits in is read "Inbox, 3 waiting". Every chip shall carry a 1px edge that is transparent, so high-contrast mode can draw it, and in the chip's own colour when more contrast is asked for; a tag's edge shall always show.

## Examples

- Given `<StatusChip tone="warning" dot>Needs you</StatusChip>`,
  when it renders,
  then it is a `<span>` with the warning colours, an `aria-hidden` dot and the words "Needs you".
- Given `<StatusChip tone="outline">Test</StatusChip>`,
  when it renders,
  then it has no fill and a `border-strong` edge.
- Given `<StatusChip tone="warning" shape="count" name="2 need you">2</StatusChip>` on an unselected tab (`data-fill="muted"`),
  when it renders,
  then its warning soft fill is laid over `surface`, not over the tab's muted fill, and its text keeps 4.5:1 in light and dark.
- Given `<StatusChip tone="accent" shape="count" name="3 waiting">3</StatusChip>` after the word "Inbox",
  when a screen reader reads it,
  then it hears "Inbox, 3 waiting"; a `count` chip without `name` doesn't type-check.
