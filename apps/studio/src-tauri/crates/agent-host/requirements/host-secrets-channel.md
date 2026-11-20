# studio.src-tauri.crates.agent-host.host-secrets-channel

- Status: draft
- Since: unreleased
- Source: HAL-14090, HAL-14126; security review pending (Julian, then Liam)

Where the shell starts the agent host with a secrets backend, after the handshake the host may send a request on connection id 0, as one `data` frame holding `{"op":"get"|"set"|"delete","name":…}` (with `"value"` for `set` only), and the shell shall answer it on id 0 with `{"ok":true,"value":…}`, where `value` is null after `set` and `delete` and when nothing is stored, or with `{"ok":false,"kind":…,"message":…}` when the keychain fails. The shell shall reach only the names of `host-secrets` (`HOST_NAMES`). It shall answer one request at a time, on a thread of its own, so the clients' connections never wait for the keychain.

The relay shall never give id 0 to a client, and never pass a frame on id 0 to one. If the host sends a request that isn't one of these, a name outside `HOST_NAMES`, a frame of another kind on id 0, or a second request before it read the first answer, then the shell shall answer nothing and stop the relay, which closes the host's input and every connection. If the shell started the host without a secrets backend, then a frame on id 0 shall stop the relay as a frame for an id never opened does. No answer's message, and nothing the shell logs, shall contain a value.

## Examples

- Given a host with one client connected,
  when the host stores `remote_host_key` and reads it back on id 0,
  then it gets the value on id 0, and the client, on id 1, gets only its own bytes.
- Given a host that asks for `serve_password` on id 0,
  when the shell reads the request,
  then it answers nothing, the relay stops and the client's connection closes.
- Given a request still waiting for the keychain,
  when the host sends a second one,
  then the relay stops.
- Given a shell that started the host without a secrets backend,
  when the host sends a request on id 0,
  then the relay stops.
- Given a system without a keychain,
  when the host asks for its key,
  then it gets `{"ok":false,"kind":"unavailable",…}` and the relay goes on.

## What it doesn't cover

A host serving on loopback (macOS, Linux) carries the same frames on its standard input and output, which hold nothing after the handshake today; the shell's side of that comes with the Studio wiring (slice 3 of the plan on HAL-14090). Requests are at most one frame (64 KiB); a value the host stores is far smaller, and a stored value too long to answer in one frame is answered as `invalid_value`. The host itself, its store and the one-time move out of its secrets file are `apps/agent-host`'s (slice 2).
