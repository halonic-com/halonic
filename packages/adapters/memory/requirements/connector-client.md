# memory.connector-client

- Status: active
- Since: 0.1.0
- Source: HAL-181; `ConnectorFactory` port v1

The memory connector factory shall stand in for one transport kind, serving the tools of the server it is created with and answering calls with that server's `answer`. It shall refuse to create a client for a config of another transport kind, naming the connector and both kinds. It shall keep its own copy of the server's tools, give each caller a fresh copy, and record every call that reached the server, in order. It shall count a `stdio` connector as a started program from its first call until it closes. Calls that arrive while a program starts shall wait for that one start, and a refused start shall be tried again on the next call. A pinned program shall start the way `contracts.connector-pin` asks, through the checks of `app.package-runner-launch` and a lookup at the pin's registry, in a new folder under `/memory/connector-folders` whatever its `cwd`, and its launch shall record the command, arguments and environment a real launcher spawns: the first argument naming the package at the pin's version, the registry set from `registryUrl`, and none of the blocked variables of the environment the factory is given to inherit. A program, with a pin or without, gets only the base of that environment and the variables its connector names in `inheritEnv` (`app.connector-inherited-env`). A program without a pin starts in its `cwd`, or else in the workspace. A refusal shall name the connector and the tool, or say that it starts a program, and say that the workspace must be trusted.

## Examples

- Given a memory factory for `http`,
  when it is asked for a client of a `stdio` config `notes`,
  then it throws naming `notes`, `stdio` and `http`.
- Given a memory factory whose server offers `read_note`,
  when a caller changes the tool list it got,
  then the next listing still offers `read_note` unchanged.
- Given an untrusted memory `http` connector `notes`,
  when `update_note` is called,
  then it throws naming `notes` and `update_note`, and saying the workspace must be trusted.
- Given a trusted memory `stdio` connector pinned to npm `@acme/mail-mcp` 2.3.1 whose registry can't be reached,
  when its tools are listed twice,
  then both calls throw saying the registry can't be reached, and no program has started.
