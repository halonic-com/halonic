# shell.command-source-context

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugins design 8.1 and 8.3 (HAL-1739); review of halonic#1831

When the window lists commands, for Ctrl K or a phone's Search, the shell shall ask each command source for its commands with the context of the feature that added the source, the same context that feature's views get, so a source can read its feature's services for the open workspace. When commands are listed without a window, the shell shall ask each source without a context.

## Examples

- Given _plugins_ adds a source whose commands come from its `plugins.list` service, which gives "Show forecast" in the open workspace,
  when Ctrl K lists the commands for "forecast",
  then "Show forecast" is there.
- Given the same source,
  when the commands are listed without a window,
  then the source is asked without a context.
