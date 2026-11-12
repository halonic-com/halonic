# studio.src-tauri.crates.agent-host.relay

- Status: draft
- Since: 0.1.0
- Source: HAL-5396, HAL-6104; security review HAL-5407 (W9); `apps/agent-host/README.md`, "Serving over standard input and output"

When the shell starts the agent host in Halonic's WSL distro, it shall first listen on a free port of `127.0.0.1` on Windows, then start the host with `--stdio --relay-host 127.0.0.1:<that port>`, so nothing in the distro listens on a port. Before the host's handshake it shall skip lines that aren't a JSON object, such as `wsl.exe`'s own messages in UTF-16, up to 64 KiB; it shall accept a JSON object only as `{"token"}` with 43 base64url characters, refuse any other, and give the relay's address as the host's. After the handshake it shall pass each connection it accepts to the host as frames, `[id u32][kind u8][length u32][bytes]` with at most 64 KiB of bytes: `open` once with a new id, the client's bytes as `data`, `end` when the client stops sending, and `reset` when the connection fails. It shall read the host's frames all the time, pass each connection's `data` and `end` to its client in order, close a connection the host resets, drop frames for a connection that has closed, and reset a connection whose client leaves more than 16 MiB unread. On a frame for an id it never opened, an unknown kind, an `open` from the host, a length over 64 KiB or the end of the host's output, it shall stop: close the host's input and every connection.

## Examples

- Given a host that prints a WSL notice, then `{"token":"<43 characters>"}`,
  when the shell starts it,
  then its address is `http://127.0.0.1:<the relay's port>` and the host was started with that port.
- Given a client that connects, sends a request and stops sending,
  when the host answers with `data` and `end`,
  then the host got `open`, the request as `data` and `end`, and the client reads the answer and then the end.
- Given a client that reads nothing,
  when the host sends it more than the limit,
  then the relay resets that connection and tells the host.
- Given the host sends a frame for an id the relay never opened,
  when the relay reads it,
  then it closes the host's input and every client.
