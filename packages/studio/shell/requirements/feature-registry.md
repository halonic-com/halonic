# shell.feature-registry

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3

The shell shall register every feature once, after every feature whose services it needs. If two features share an id, a needed service has no provider, a service has two providers, or features need each other's services in a cycle, then the shell shall throw a `ShellError` that names the features and services involved, and no feature shall be registered.

## Examples

- Given a feature _routines_ that needs a service _agents_ provides, listed before _agents_,
  when the shell is created,
  then _agents_ registers before _routines_.
- Given two features with the id `agents`,
  when the shell is created,
  then a `ShellError` naming `agents` is thrown.
- Given _routines_ needs `agents` and no feature or host service provides it,
  when the shell is created,
  then a `ShellError` naming `routines` and `agents` is thrown.
- Given features _a_ and _b_ that each need the other's service,
  when the shell is created,
  then a `ShellError` showing the cycle `a → b → a` is thrown.
