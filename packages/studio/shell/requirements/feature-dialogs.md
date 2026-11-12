# shell.feature-dialogs

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugins design 8.1 (HAL-1739); review of halonic#1831

The shell shall let a feature add a view that draws its dialogs through `dialogs.add`, such as the dialog of a plugin command picked in Ctrl K. The window shall draw each one once, on the desktop and on a phone, with the context of the feature that added it, in the order of `order`, then `id`. If two share an id, then the shell shall throw a `ShellError` naming both features. If a view fails to load or to draw, then the window shall show nothing in its place, report the error to the console, and keep the other views and the rest of the window.

## Examples

- Given _plugins_ adds the dialogs view `plugins.command-dialog`, which draws "Show forecast" when a command is open,
  when the window is drawn and the command opens,
  then the dialog "Show forecast" shows, drawn with the _plugins_ context.
- Given one feature's dialogs view throws while drawing,
  when the window is drawn,
  then the other features' dialogs views and the page still show.
- Given _plugins_ and _agents_ both add the dialogs view `dialogs`,
  when the shell is created,
  then a `ShellError` naming both is thrown.
