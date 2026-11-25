# connections.list-retry

- Status: active
- Since: unreleased
- Source: HAL-18311 (the board's check on Windows: "Halonic couldn't read the connections." with no way out)

If the engine can't list the connections, then Settings › Connections shall show "Halonic couldn't read the connections. Close Settings and open it again." with a Try again button, and shall report the failure with its error to the console. When the person presses Try again, the section shall ask the engine for the list again, and show it when the engine answers.

## Examples

- Given an engine that fails to list the connections once,
  when Settings › Connections opens and the person presses Try again,
  then the section shows the connections.
- Given an engine that fails to list the connections,
  when Settings › Connections opens,
  then the console has the failure with its error.
