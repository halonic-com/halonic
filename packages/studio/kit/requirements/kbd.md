# kit.kbd

- Status: active
- Since: 0.1.0
- Source: HAL-1289, HAL-1563; base component specs 14 (Kbd) and 0.2

The kit's `Kbd` shall render each key of a shortcut in its own `<kbd>` box, in the order given, and shall be hidden on a phone. Inside a muted fill (`data-fill="muted"`, or a hovered or pressed `data-hover-fill="muted"`), each box shall take the `border` fill with `fg` text.

## Examples

- Given `<Kbd keys={["Ctrl", "K"]} />`,
  when it renders,
  then there are two `<kbd>` elements, "Ctrl" and "K", inside a wrapper with `phone:hidden`.
