# shell.feature-services

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3, 5.4

A feature shall provide each service in its `provides` by giving a factory in `register`. If it provides a service it doesn't list, provides one twice, or leaves a listed one out, then the shell shall throw a `ShellError`. When the services are built for a workspace, the shell shall run the factories in dependency order, and a factory shall get only services its feature lists in `needs` or `provides`. A factory may read another of its own feature's services; the shell shall build that one first, whatever order `provide` was called in. If a feature's own services need each other in a cycle, then the shell shall throw a `ShellError` naming the feature and the cycle.

## Examples

- Given _agents_ provides `agents` and _routines_ needs it,
  when the services are built into a workspace registry,
  then the _routines_ factory receives the built `agents` service.
- Given a factory of _routines_ asks for a service not in its `needs`,
  when the services are built,
  then a `ShellError` naming _routines_ and that service is thrown.
- Given _agents_ lists `agents` in `provides` but never provides it,
  when the shell is created,
  then a `ShellError` is thrown.
- Given _both_ provides `main` before `helper`, and the `main` factory reads `helper`,
  when the services are built,
  then `helper` is built first and `main` receives it.
- Given _looping_ provides `first` and `second`, and each factory reads the other,
  when the services are built,
  then a `ShellError` naming _looping_ and the cycle is thrown.
- Given a host service listed by the app but missing from the workspace registry,
  when the services are built,
  then a `ShellError` naming it is thrown.
