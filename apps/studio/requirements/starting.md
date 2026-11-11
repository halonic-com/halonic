# studio.starting

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 16d; Sofia's UX check of #1713 (HAL-5329)

While the Studio page loads and the window hasn't drawn yet, the page shall show "Starting Halonic…". When the window draws, it shall replace that text.

## Examples

- Given the Studio page,
  when it has loaded but the window hasn't drawn,
  then it shows "Starting Halonic…".
- Given the Studio page showing "Starting Halonic…",
  when the window draws,
  then the text is gone and the window tabs and Home show.
