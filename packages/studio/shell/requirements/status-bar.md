# shell.status-bar

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); UX checklist part 1, 1.4 (HAL-1323); microcopy 1.3 (HAL-751); CHK 1 (HAL-901); HAL-3926

The shell shall show the status bar items features added with `statusBar.add`, in their order, each with the context of the feature that added it, importing each item's view the first time the status bar shows. The status bar shall show state only and shall not be a live region; results are toasts. With no items, the status bar shall be empty. If an item's view fails to load or to draw, then the shell shall show nothing in its place, report the error to the console, and keep the other items and the rest of the frame.

## Examples

- Given the items `spend` (order 20) and `branch` (order 10),
  when the status bar shows,
  then it reads `branch`'s item, then `spend`'s, each with its own feature's context.
- Given no feature added a status bar item,
  when the status bar shows,
  then it is empty and has no live region.
- Given the item `spend` names a view its module doesn't export, and `branch` loads,
  when the status bar shows,
  then it reads only `branch`'s item, and the `ShellError` naming the view is reported to the console.
