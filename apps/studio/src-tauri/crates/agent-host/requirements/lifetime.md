# studio.src-tauri.crates.agent-host.lifetime

- Status: draft
- Since: 0.1.0
- Source: HAL-4878, HAL-6256; `apps/agent-host/README.md`, "Serving on loopback"

The shell shall start the agent host from the executable next to its own, as `halonic-agent-host --profile-folder <profile>`, followed by `--sweep-root <folder>` for each folder its caller names, with its standard input and output piped, and wait a limited time for its handshake line. When the host can't start, ends before that line, prints nothing in time or prints a line that isn't a handshake, the shell shall kill it if it runs and report why. For a program the system won't start, it shall tell a missing one (not found) from a blocked one (permission denied, or refused by an antivirus program). For a host that ends before that line, it shall keep its exit code, or none when a signal stopped it. While the shell holds the host, its standard input stays open. When the shell lets it go, it shall close that input, wait a grace period for the host to close its sessions and exit, and kill it after that.

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
- Given a host that exits with code 3 before its handshake,
  when the shell starts it,
  then the shell says it stopped, with exit code 3.
- Given a host file without permission to run,
  when the shell starts it,
  then the shell says it was blocked, not that it is missing.
