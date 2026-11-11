# studio.src-tauri.crates.agent-host.lifetime

- Status: draft
- Since: 0.1.0
- Source: HAL-4878; `apps/agent-host/README.md`, "Serving on loopback"

The shell shall start the agent host from the executable next to its own, as `halonic-agent-host --profile-folder <profile>`, with its standard input and output piped, and wait a limited time for its handshake line. When the host can't start, ends before that line, prints nothing in time or prints a line that isn't a handshake, the shell shall kill it if it runs and report why. While the shell holds the host, its standard input stays open. When the shell lets it go, it shall close that input, wait a grace period for the host to close its sessions and exit, and kill it after that.

## Examples

- Given a host that prints its handshake,
  when the shell holds it,
  then it keeps running.
- Given a running host,
  when the shell stops it,
  then its input closes and it exits on its own.
- Given a host that runs on after its input closes,
  when the grace period ends,
  then the shell kills it.
- Given a host that prints nothing,
  when the wait ends,
  then the shell kills it and says it didn't serve in time.
