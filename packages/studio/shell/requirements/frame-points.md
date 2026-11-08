# shell.frame-points

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3

The shell shall let a feature add cards, panel windows, status bar, title bar and phone bar items, and settings sections only through the points `cards.add`, `panelWindows.add`, `statusBar.add`, `titleBar.add`, `phoneBar.add` and `settings.add`. The shell shall list each point's contributions by `order`, lowest first, then by `id`, and record which feature added each one. The shell shall accept only ids and card selections that are names of letters, digits and dashes, starting with a letter, joined by dots, and only contributions that are plain objects (object literals), because the shell keeps a copy and a copy of an object made from a class would lose its methods. If two contributions to a point share an id (per selection for cards), an id or selection isn't a valid name, or a contribution isn't a plain object, then the shell shall throw a `ShellError` that names the features involved.

## Examples

- Given status bar items `spend` (order 20), `errors` (order 10) and `target` (order 10),
  when the status bar is listed,
  then the order is `errors`, `target`, `spend`.
- Given cards `summary` for `agent` and `summary` for `run`,
  when the shell is created,
  then both are accepted, and the cards for `agent` are only the first.
- Given _agents_ and _runs_ both add the settings section `models`,
  when the shell is created,
  then a `ShellError` naming both features is thrown.
