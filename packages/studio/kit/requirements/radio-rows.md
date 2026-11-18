# kit.radio-rows

- Status: active
- Since: unreleased
- Source: HAL-12240; phase B build plan decision 18 (HAL-12232); tunnel phase B screens, the typed code's computer list (HAL-12206)

With `layout="rows"` the kit's `RadioGroup` shall be a choose-one list: its options shall sit as rows in one box with a 1px `border` edge, a 12px radius and a `surface` fill, with a 1px `border` line between rows. Each row shall be its whole target, at least 56px high (64px on a phone or a touch screen), with 12px by 16px padding and its circle centred beside its label and note, 12px before them. A picked option's field shall show inside its row, lined up with its label. Everything else (one Tab stop, the arrow keys, the names and notes, unavailable options and the error edge) shall be as in the stacked layout.

## Examples

- Given the computers "Tim's laptop" (note "Tailscale") and "Studio PC" (note "This Wi-Fi") in rows with "Tim's laptop" picked,
  when the group renders,
  then both are rows in one bordered box, the second with a line above it, and "Tim's laptop" is checked.
- Given those rows,
  when the user clicks the row of "Studio PC",
  then `onChange` is called with its value.
