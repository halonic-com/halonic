# connector-stdio-sandbox.session-start

- Status: active
- Since: 0.1.0
- Source: HAL-1738 (plugins P5), plugins ADR sections 1.2, 3 and 4; plan reviewed by Liam on HAL-4783

The sandboxed stdio connector shall start a plugin local tool's program only through the `SandboxSession` in its context, and never on this computer. Its factory shall refuse to create a connector whose context has no session. The connector shall start nothing, in the session or anywhere else, without a trust grant or while the session's fence proof isn't `fenced`, and shall say why with `SandboxNotFencedError`. It shall start the command Halonic built for the local tool in the session's working folder, refuse a config with a `cwd`, and treat a program that stops as the host's stdio connector does: the waiting call fails and isn't sent again, and the next call starts the program again in the same session, up to the restart limit, without keeping any of the program's error output, not even in memory, because it can hold the secrets the profile gave it.

## Examples

- Given a context without a sandbox session,
  when the factory is asked to create the connector,
  then it throws.
- Given a context without a trust grant,
  when the connector lists its tools,
  then it throws and `session.start` is never called.
- Given a program that crashes while `read_note` runs,
  when the next call arrives,
  then a second program starts in the same session and answers it, and `read_note` reached the first one once.
