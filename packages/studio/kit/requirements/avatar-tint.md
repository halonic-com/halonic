# kit.avatar-tint

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), point 3 ("the colour yes, the bubble no"); built on HAL-19763

Where an `Avatar` without a picture is given an agent's tint, it shall draw the initials in `fg` on that tint instead of `fg-muted` on `surface-muted`. Without a tint, it shall stay neutral. A picture shall show as before, whatever the tint.

## Examples

- Given the name "Chief" and the tint `bg-agent-teal`,
  when the avatar renders,
  then it shows "C" in `fg` on the teal tile.
- Given the name "Sofia Marin" and no tint,
  when the avatar renders,
  then it shows "SM" in `fg-muted` on `surface-muted`.
