# kit.button-on-tint

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 17.1 and 9

When a `ghost` `Button` sits inside a box with a tinted fill (a Callout's action), the kit shall draw its label in `accent-text` and use `surface` as its hover and press fill, so it lifts out of the tint. Every other variant, and a ghost button outside such a box, shall keep its own look.

## Examples

- Given a Callout with the action "Try again",
  when it renders,
  then the button's label is `accent-text` and its hover fill is `surface`.
