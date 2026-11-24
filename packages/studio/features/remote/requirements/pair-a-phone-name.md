# remote.pair-a-phone-name

- Status: active
- Since: unreleased
- Source: HAL-17795; follows `pair-a-phone`

When the Pair a phone dialog shows the name a phone gave itself, on Check the code or in "Pixel 8 is paired", it shall show at most the first 64 characters of it, followed by "…" when the name is longer, and shall show each hidden character in it (a control, zero-width or direction character, as `@halonicjs/std` lists them, and tab and newline) as a marker such as `⟦U+202E⟧` instead of the character itself.

## Examples

- Given a phone named "Pixel" with a right-to-left override and "8" after it used the code,
  when the dialog shows Check the code,
  then it shows the name as "Pixel⟦U+202E⟧8".
- Given a phone whose name has 100 characters used the code,
  when the dialog shows Check the code,
  then it shows the first 64 characters of the name and "…".
