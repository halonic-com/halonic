# kit.letter-tile

- Status: active
- Since: unreleased
- Source: HAL-12240; size `lg` HAL-16050; phase B build plan decision 18 (HAL-12232); visual pass HAL-12222 (`accent` on `accent-soft` was 4.3:1)

The kit's `LetterTile` shall show the first character of its `name`, trimmed and upper case, or "?" for an empty name, in `text-small` at weight 600 in `accent-text` centred on a 28px `accent-soft` tile, so that the letter keeps the 4.5:1 that the kit's contrast test checks for `accent-text` on `accent-soft`. A character outside the basic plane (an emoji) shall show whole. Given `size="lg"`, the tile shall be 48px with a 12px radius (`radius-md`) and the letter in `text-heading`, in the same colours. The tile shall be hidden from screen readers, because the name sits next to it.

## Examples

- Given the name " reporter",
  when the tile renders,
  then it shows "R" in `accent-text` and is hidden from screen readers.
- Given an empty name,
  when the tile renders,
  then it shows "?".
- Given the name "acme" and `size="lg"`,
  when the tile renders,
  then it shows "A" on a 48px tile in `text-heading`.
