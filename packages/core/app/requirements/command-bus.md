# app.command-bus

- Status: active
- Since: 0.1.0
- Source: HAL-116 (the old `Studio` methods become typed commands)

The command bus shall run each command through the one handler registered for it and return what the handler returns. If a command has no handler, then executing it shall reject with a `CommandError`. If a second handler is registered for a command, or a handler is registered after the bus closed, then the bus shall throw a `CommandError` and keep the first. Where a feature adds commands and events to `AppCommands` and `AppEvents`, their names and payloads shall be checked at compile time.

## Examples

- Given a handler for `greet` that returns `Hello <name>`,
  when `greet` is executed with `Ada`,
  then the result is `Hello Ada`.
- Given no handler for `save`,
  when `save` is executed,
  then the promise rejects with a `CommandError`.
- Given a handler for `greet`,
  when another handler for `greet` is registered,
  then a `CommandError` is thrown and the first handler still answers.
- Given a handler whose remove function was called,
  when the command is executed,
  then it rejects with a `CommandError`; calling the old remove function after a new handler was registered leaves the new one in place.
- Given a command whose input is `void`,
  when it is executed without an input,
  then it runs.
- Given a feature that adds `typing.rename` to `AppCommands` and `typing.renamed` to `AppEvents`,
  when code uses an unknown name or a wrong payload,
  then it doesn't compile; correct uses run.
