# studio.src-tauri.engine-lifetime

- Status: draft
- Since: unreleased
- Source: HAL-14220; decisions D7, D8 and D10 of the B1 design note (HAL-14206), the security review (HAL-14212), HAL-17184

When the desktop page opens a workspace folder, it shall ask the shell for that workspace's background engine with `engine_open` before it looks for one, and the shell shall start the engine (`halonic-agent-host --engine`, beside the shell) unless one runs for that folder already, connect the window once the engine's handshake is in, and refuse a folder the window hasn't opened. The shell shall run at most one engine per workspace for every window that opens it, and shall keep it running when a window closes. After every handshake the shell shall send the engine the sandbox host's connection, or that none runs, and the user's Pause routines for that workspace. If an engine ends without the shell stopping it, then the shell shall disconnect its windows and start it again, at most 3 times in 5 minutes, and after that leave it stopped until a window opens the workspace again. When Halonic quits, or before an update's installer runs, the shell shall stop every engine at once, each with its 15 seconds.

## Examples

- Given a window that opened the folder `acme`,
  when the page asks for its engine,
  then the shell starts one and the page's engine calls reach it.
- Given an engine already running for `acme`,
  when a second window opens `acme`,
  then both windows use that one engine.
- Given an engine that crashed 3 times in the last 4 minutes,
  when it crashes again,
  then the shell doesn't start it again, and its windows have no engine.
- Given a window that closed,
  when its workspace has a running engine,
  then the engine keeps running.
