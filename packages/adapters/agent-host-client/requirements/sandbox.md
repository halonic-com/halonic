# agent-host-client.sandbox

- Status: active
- Since: 0.1.0
- Source: HAL-4878; `apps/agent-host/README.md`, "The sandbox over loopback"

The stand-in `Sandbox` shall answer `check` with the host's `GET /v1/sandbox/check` and `capabilities` with the host's capabilities as read when it connected, and shall open a session with `POST /v1/sandbox/sessions/open` and the profile unchanged, giving the session the host's id and fence proof. When the host refuses to open one, the stand-in shall throw an error with the host's status, kind and message. A session shall pass each blocked access the host streams for it to its listeners, skipping a line that isn't a `SandboxBlock` and going on after a listener that throws. It shall refuse to start a program itself, because its programs start in the host, through a harness. Closing it shall stop its blocked stream and close it in the host once, however often it is called, and a session the host has already closed shall count as closed.

## Examples

- Given a host that opens a session with id `s1` and a fenced proof,
  when the engine opens a profile,
  then the session's fence is `fenced` and the harness names `s1` to the host.
- Given a host that answers 422 `sandbox_open_failed`,
  when the engine opens a profile,
  then it gets that kind and the sandbox's reason.
- Given a session whose time limit the host has already closed,
  when the engine closes it,
  then closing succeeds.
