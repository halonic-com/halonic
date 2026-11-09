# memory.connector-client

- Status: active
- Since: 0.1.0
- Source: HAL-181; `ConnectorFactory` port v1

The memory connector factory shall stand in for one transport kind, serving the tools of the server it is created with and answering calls with that server's `answer`. It shall refuse to create a client for a config of another transport kind, naming the connector and both kinds. It shall keep its own copy of the server's tools, give each caller a fresh copy, and record every call that reached the server, in order. It shall count a `stdio` connector as a started program from its first call until it closes. A refusal shall name the connector and the tool, or say that it starts a program, and say that the workspace must be trusted.

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
