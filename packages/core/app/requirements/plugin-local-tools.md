# app.plugin-local-tools

- Status: active
- Since: 0.1.0
- Source: HAL-1738 plan, rules 9 and 10; the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.2 and 4

The app shall run each local tool of a trusted plugin through a connector that opens a sandbox session of its own on its first call, with the profile and config the host prepared and the plugin's trust grant, and that creates the local tool's connector only through the factory it was given, with that session. When the session's fence proof is not `fenced` (it is `off`, as for the launcher, `not-fenced`, or already `stopped`), the app shall close the session, create no connector, and fail the call with the state `sandbox-not-fenced`, because local tools run only fenced. When the session has ended, the app shall fail the call that found it ended, close that session and its connector, and open a new session on the next call. Where the host has no sandbox, the plugin shall still load, and each of its local tools shall report the load state `needs-desktop-app` instead of starting. Where the host's sandbox can't start on this machine, each local tool shall report `sandbox-unavailable` with the sandbox's reason. It shall report codes, never sentences.

## Examples

- Given a host with no sandbox, such as Android or the browser,
  when a local tool is called,
  then the call fails with `LocalToolUnavailableError` in the state `needs-desktop-app`, and nothing crashes.
- Given a sandbox that reports `bubblewrap-missing`,
  when a local tool is called,
  then the call fails in the state `sandbox-unavailable` with that reason, and no connector is created.
- Given a sandbox whose session opens with the fence `off`, `not-fenced` or `stopped`,
  when a local tool is called,
  then the call fails in the state `sandbox-not-fenced`, the session is closed, and no connector is created.
- Given a working sandbox,
  when a local tool is called twice,
  then one session is opened, with the plugin's grant, and both calls go to it.
- Given a local tool whose session's time limit ran out,
  when it is called,
  then that call fails, the session and its connector are closed, and the next call opens a new session.
