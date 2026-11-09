# kit.status-chip

- Status: active
- Since: 0.1.0
- Source: HAL-1289, HAL-1563; base component specs 10 and 23.5

The kit's `StatusChip` shall render a word or a count as a non-interactive element in one of seven tones (`neutral`, `accent`, `running`, `warning`, `danger`, `success`, and `outline` for a tag), each coloured tone being its colour on its own soft fill. Inside a muted fill (`data-fill="muted"`, or a hovered or pressed `data-hover-fill="muted"`), a `neutral` chip shall take the `border` fill with `fg` text. When a chip has `dot`, the kit shall draw a still 6px dot in the text colour before the word, hidden from screen readers. When its `shape` is `count`, the kit shall draw it round with tabular figures. Every chip shall carry a 1px edge that is transparent, so high-contrast mode can draw it, and in the chip's own colour when more contrast is asked for; a tag's edge shall always show.

## Examples

- Given `<StatusChip tone="warning" dot>Needs you</StatusChip>`,
  when it renders,
  then it is a `<span>` with the warning colours, an `aria-hidden` dot and the words "Needs you".
- Given `<StatusChip tone="outline">Test</StatusChip>`,
  when it renders,
  then it has no fill and a `border-strong` edge.
