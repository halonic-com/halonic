# kit.author-line

- Status: active
- Since: unreleased
- Source: the Messenger change approved on HAL-19132, point 4 (name semibold in the normal colour, time muted); Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), point 4; built on HAL-19763

The kit's `AuthorLine` shall show who wrote a message and when as the author's avatar followed by "Name · time", the name semibold in `fg` and the dot and time in `fg-muted`, in `text-small`. Where it is marked visual only, it shall be hidden from screen readers.

## Examples

- Given the name "Chief", the time "09:00" and the tint `bg-agent-sky`,
  when the line renders,
  then it shows the sky "C" avatar and "Chief · 09:00", with "Chief" semibold in `fg`.
- Given the same line marked visual only,
  when a screen reader reads the page,
  then it skips the line.
