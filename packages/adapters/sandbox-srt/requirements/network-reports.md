# sandbox-srt.network-reports

- Status: active
- Since: unreleased
- Source: HAL-12648, HAL-12644 (studio-claims 4.7)

The sandbox-srt adapter shall report each network request that sandbox-runtime's proxy refused a program to the session's `onBlocked` listeners, as a `network` block with the host and port the program asked for, read outside the fence from srt's report descriptor, and shall report no request the proxy let through. On Linux and macOS the program never gets that descriptor; on Windows it can reach it, so every report line is untrusted: a line over 1 KiB is dropped without being held whole, and only a host srt itself would accept (at most 255 characters, an IP address or DNS-name characters) with a port from 1 to 65535 makes a block. A report line it can't read is left out, never reported as something else.

## Examples

- Given a session whose allowed sites don't include `blocked.example`,
  when a program in the fence asks the proxy for `blocked.example:443`,
  then the session's listeners hear `{ kind: "network", host: "blocked.example", port: 443 }`.
- Given a session whose bridge the proxy lets through,
  when a program in the fence reaches the bridge,
  then the session's listeners hear no block for it.
- Given srt's report line `deny network-outbound [::1]:8080 (host is not on the allow list)` or `deny network-outbound ::1:8080 (…)`,
  when it is read,
  then the block names the host before the last colon and port 8080.
- Given a report line that isn't a refused request, names a port of 0 or above 65535, or names a host srt would refuse (such as one of 300 characters, or one with `<`, `/` or `%`),
  when it is read,
  then no block is reported.
- Given report bytes that run past 1 KiB without a line feed,
  when they are read,
  then at most 1 KiB of them is held, the line is dropped, and the next line is read as usual.
