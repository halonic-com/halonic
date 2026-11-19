# shell.code-load-failure

- Status: active
- Since: unreleased
- Source: HAL-13361

The shell shall count an error as a failed load of a view's code only when it is the browser's failed module import, "Failed to fetch dynamically imported module" (Chromium), "error loading dynamically imported module" (Firefox) or "Importing a module script failed" (Safari), or Vite's "Unable to preload CSS for". Any other error, such as one a view throws while it draws or a view the module doesn't export, shall not count.

## Examples

- Given the error "TypeError: Failed to fetch dynamically imported module: https://computer.local/assets/inbox-page.js",
  then it counts as a failed load.
- Given the error "TypeError: steps is undefined",
  then it doesn't count.
