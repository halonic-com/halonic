# studio.src-tauri.crates.agent-host.handshake

- Status: draft
- Since: 0.1.0
- Source: HAL-4878; `apps/agent-host/README.md`, "Serving on loopback"

When the agent host prints its first line, the shell shall accept it only as JSON with exactly `url` and `token`, where `url` is `http://127.0.0.1:<port>` with a port from 1 to 65535 and nothing after it, and `token` is 43 base64url characters. Otherwise, including when the line isn't UTF-8 text, the shell shall refuse the host, and its error shall say what is wrong without repeating the line. The shell shall never show the token in a debug view or an error.

## Examples

- Given `{"url":"http://127.0.0.1:49152","token":"<43 characters>"}`,
  when the shell reads it,
  then it calls that address with that token.
- Given a `url` of `http://localhost:49152` or `http://127.0.0.1:49152/`,
  when the shell reads it,
  then it refuses the host and never sends the token there.
- Given a line that isn't JSON, or has a field more,
  when the shell reads it,
  then its error doesn't contain the line.
