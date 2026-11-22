# studio.src-tauri.crates.agent-host.host-secrets-channel

- Status: draft
- Since: unreleased
- Source: HAL-14090, HAL-14126, HAL-14962 (answers bounded to one frame), HAL-14090 slice 3 (loopback, Studio's wiring)

Where the shell starts the agent host with a secrets backend, the shell shall tell the host so with `--keychain-relay`, and shall add that argument to no other start. Studio shall start the real host, beside it or in Halonic's WSL distro, with the OS keychain as that backend. After the handshake the host may send a request on connection id 0, as one `data` frame holding `{"op":"get"|"set"|"delete","name":…}` (with `"value"` for `set` only), and the shell shall answer it on id 0 with `{"ok":true,"value":…}`, where `value` is null after `set` and `delete` and when nothing is stored, or with `{"ok":false,"kind":…,"message":…}` when the keychain fails. The shell shall reach only the names of `host-secrets` (`HOST_NAMES`). It shall answer one request at a time, on a thread of its own, so the clients' connections never wait for the keychain. A host behind the relay sends its frames among the clients'; a host serving on loopback sends them on its standard output after the handshake line, and gets the answers on its standard input. Every answer shall fit in one frame of at most 64 KiB: the shell shall refuse a `set` whose value couldn't be read back in one answer with `{"ok":false,"kind":"invalid_value",…}` before the keychain runs, and shall answer a stored value too long for one frame the same way.

The relay shall never give id 0 to a client, and never pass a frame on id 0 to one. If the host sends a request that isn't one of these, a name outside `HOST_NAMES`, a frame of another kind on id 0, or a second request before it read the first answer, then the shell shall answer nothing and stop the relay, which closes the host's input and every connection; on loopback, a frame on any other id breaks the rules too, and the shell closes the host's input. If the shell started the host without a secrets backend, then a frame on id 0 shall stop the relay as a frame for an id never opened does. No answer's message, and nothing the shell logs, shall contain a value.

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
- Given a value that JSON escaping would make longer than one frame,
  when the host stores it on id 0,
  then it gets `{"ok":false,"kind":"invalid_value",…}` and nothing is stored.
- Given a system without a keychain,
  when the host asks for its key,
  then it gets `{"ok":false,"kind":"unavailable",…}` and the relay goes on.

- Given a host serving on loopback that Studio started with the keychain,
  when it asks for `remote_host_key` on its standard output after the handshake,
  then it gets the answer on its standard input.
- Given a host serving on loopback,
  when it sends a frame on id 1,
  then the shell closes its input.

## What it doesn't cover

Requests are at most one frame (64 KiB), like answers. The host itself, its store and the one-time move out of its secrets file are `apps/agent-host`'s (slice 2).
