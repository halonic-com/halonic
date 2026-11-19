# kit.tabs-vertical

- Status: active
- Since: unreleased
- Source: HAL-12704, from the UX check on HAL-12689; base component specs 23

When `orientation` is `vertical`, the kit's `TabList` shall render its tabs as a named `tablist` with `aria-orientation="vertical"`: a column of rows as wide as their container, each at least 32px high (48px on a touch screen), with the label at the start, wrapping instead of being cut, and any counter or running dot at the row's end. The selected row shall be drawn on an `accent-soft` fill in the selected weight and `fg`, with a 1px `CanvasText` outline in high contrast only; the other rows shall be `fg-muted`, on a `surface-subtle` fill when hovered. Only the selected tab shall be in the Tab order. When the user presses the up or down arrow key, Home or End in the list, the kit shall move focus to that tab and select it, wrapping round at the ends and skipping disabled tabs, and the left and right arrow keys shall do nothing. A horizontal `TabList` shall say `aria-orientation="horizontal"` and leave the up and down arrow keys alone.

## Examples

- Given a vertical list of Behaviour, Model and Harness with Behaviour selected and focused,
  when the user presses the down arrow key,
  then Model is selected and focused, and the panel, now labelled by Model, shows its page.
- Given the same list with Behaviour selected,
  when the user presses the up arrow key,
  then Harness is selected, wrapping round from the top.
- Given the same list,
  when the user presses the right arrow key,
  then nothing changes.
