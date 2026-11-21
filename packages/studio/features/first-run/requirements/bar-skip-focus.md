# first-run.bar-skip-focus

- Status: active
- Since: unreleased
- Source: HAL-15296 (design check C556-1c on HAL-15257, WCAG 2.4.3); `first-run.bar`

When **Skip, I'll explore** pauses the first run and the first-run bar goes with it, the First Run feature shall give focus to the shown page's `h1`, or to the page's main region while it has no `h1`, so focus doesn't fall to the window's body and the next Tab doesn't start from the top.

## Examples

- Given the first run is on at Demo on the page "Acme sample",
  when Enter on **Skip, I'll explore** pauses it,
  then the bar is gone and focus is on the `h1` "Acme sample".
- Given the shown page has no `h1`,
  when **Skip, I'll explore** pauses the first run,
  then focus is on the page's main region.
