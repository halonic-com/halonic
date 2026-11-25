# remote.paired-phones-name

- Status: active
- Since: unreleased
- Source: HAL-17880; follows `pair-a-phone-name`

When Settings › Remote shows a paired phone's name, in its row of the paired phones, on its Revoke button for a screen reader, or in the dialog that revokes it, it shall show the name as the Pair a phone dialog does (`remote.pair-a-phone-name`): at most the first 64 characters, followed by "…" when the name is longer, with each hidden character shown as a marker such as `⟦U+202E⟧`.

## Examples

- Given a paired phone named "Pixel" with a right-to-left override and "8" after it,
  when the section shows,
  then its row shows the name as "Pixel⟦U+202E⟧8".
- Given a paired phone named "Pixel" with a zero-width space and "8" after it,
  when the person presses its Revoke,
  then the dialog's title is "Revoke Pixel⟦U+200B⟧8?".
