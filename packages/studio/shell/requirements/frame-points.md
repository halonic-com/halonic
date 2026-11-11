# shell.frame-points

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3; settings scopes: HAL-1294 (T11), flow-settings 2 and state-coverage ST 1.1

The shell shall let a feature add cards, panel windows, status bar, title bar and phone bar items, and settings sections only through the points `cards.add`, `panelWindows.add`, `statusBar.add`, `titleBar.add`, `phoneBar.add` and `settings.add`. The shell shall list each point's contributions by `order`, lowest first, then by `id`, and record which feature added each one. The shell shall list settings sections by group first: those with the scope `workspace`, then those with the scope `display` or `host` together. The shell shall accept only ids and card selections that are names of letters, digits and dashes, starting with a letter, joined by dots, and only contributions that are plain objects (object literals), because the shell keeps a copy and a copy of an object made from a class would lose its methods. If two contributions to a point share an id (per selection for cards), an id or selection isn't a valid name, a contribution isn't a plain object, or a settings section's scope isn't `workspace`, `display` or `host`, then the shell shall throw a `ShellError` that names the features involved.

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
- Given the sections `appearance` (display, order 10), `assistant` (host, order 30), `formats` (display, order 20) and `models` (workspace, order 10),
  when the settings sections are listed,
  then the order is `models`, `appearance`, `formats`, `assistant`.
- Given _models_ adds a settings section with the scope `profile`,
  when the shell is created,
  then a `ShellError` naming _models_ and the section is thrown.
