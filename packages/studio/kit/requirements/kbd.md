# kit.kbd

- Status: active
- Since: 0.1.0
- Source: HAL-1289, HAL-1563; base component specs 14 (Kbd) and 0.2

The kit's `Kbd` shall render each key of a shortcut in its own `<kbd>` box, in the order given, and shall be hidden on a phone and from screen readers; the control names the shortcut with `aria-keyshortcuts`. Inside a muted fill (`data-fill="muted"`, or a hovered or pressed `data-hover-fill="muted"`), each box shall take the `border` fill with `fg` text. The kit's `keyShortcutsLabel(keys)` shall turn the same keys into that value, joined with `+`, writing `Ctrl` as `Control` and `⌘` as `Meta`.

## Examples

- Given `<Kbd keys={["Ctrl", "K"]} />`,
  when it renders,
  then there are two `<kbd>` elements, "Ctrl" and "K", inside a wrapper with `phone:hidden` and `aria-hidden="true"`.
- Given the keys `["Ctrl", "Shift", "T"]`,
  when they go through `keyShortcutsLabel`,
  then the result is "Control+Shift+T"; for `["⌘", "K"]` it is "Meta+K".
