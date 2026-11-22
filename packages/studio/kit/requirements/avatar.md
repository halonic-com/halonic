# kit.avatar

- Status: active
- Since: unreleased
- Source: HAL-16050 (Cloud's S2 look, HAL-13209, draws it in the dashboard's top bar)

The kit's `Avatar` shall show the first characters of the first two words of its `name`, upper case, or "?" for an empty name, in `text-caption` at weight 600 in `fg-muted` centred on a 28px round `surface-muted` tile. A character outside the basic plane (an emoji) shall show whole. The tile shall be hidden from screen readers, because the member's name sits next to it.

## Examples

- Given the name "Sofia Marin",
  when the avatar renders,
  then it shows "SM" and is hidden from screen readers.
- Given the name "Sofia",
  when the avatar renders,
  then it shows "S".
- Given an empty name,
  when the avatar renders,
  then it shows "?".
