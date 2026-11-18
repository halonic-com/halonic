# app.plugin-local-tools

- Status: active
- Since: unreleased
- Source: HAL-1738 plan, rules 9 and 10; HAL-12343 (the trust check before every session); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.2 and 4

The app shall run each local tool of a trusted plugin through a connector that opens a sandbox session of its own on its first call. Before every session opens, the first and each one after a session ended, the app shall read the plugin's folder again as `app.plugin-backend` does and check the person's trust against what is in it now; unless the plugin is `trusted` for exactly this manifest and these files, with the location and fingerprint of the grant the tool was loaded with, it shall throw `PluginLocalToolNotTrustedError` with the reason (`unreadable`, `not-trusted`, `changed`, `record-unreadable` or `not-checked`), and open and start nothing. A plugin trusted again after a change counts as `changed` until it is loaded again. The host builds the session from the plugin as it was checked, never from a second read. The session opens with the profile and config the host prepared and the plugin's trust grant, and that creates the local tool's connector only through the factory it was given, with that session. When the session's fence proof is not `fenced` (it is `off`, as for the launcher, `not-fenced`, or already `stopped`), the app shall close the session, create no connector, and fail the call with the state `sandbox-not-fenced`, because local tools run only fenced. When the session has ended, the app shall fail the call that found it ended, close that session and its connector, and open a new session on the next call. Where the host has no sandbox, the plugin shall still load, and each of its local tools shall report the load state `needs-desktop-app` instead of starting. Where the host's sandbox can't start on this machine, each local tool shall report `sandbox-unavailable` with the sandbox's reason. Where the sandbox choice has MXC in use and MXC counts as a fence for local tools (`mxcFencesLocalTools`, which stays `false`), a local tool whose profile allows no site and has no bridge (`bridge` is `null`) shall open its session in MXC, with the same fence check as in any sandbox; one whose profile allows any site or has a bridge, such as a declared `network` or a pinned package's registry, shall fail the call with the state `network-needs-srt`, before MXC's `open` and with nothing started, because MXC's SDK v1 has no rule per host name. While the switch is `false` or MXC isn't in use, the host's own sandbox decides as before. It shall report codes, never sentences.

## Examples

- Given a trusted plugin whose script changed after it loaded,
  when its local tool is called, the first time or after its session ended,
  then the call fails with `PluginLocalToolNotTrustedError` and the reason `changed`, and no session opens.
- Given a plugin whose trust the person took back,
  when its local tool is called,
  then the call fails with the reason `not-trusted`, and no session opens.
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
- Given MXC is in use and counts as a fence,
  when a local tool that declares no network is called,
  then its session opens in MXC and the call goes to it.
- Given MXC is in use and counts as a fence,
  when a local tool that declares a network is called,
  then the call fails in the state `network-needs-srt`, and no session opens.
- Given MXC doesn't count as a fence, which is how it ships,
  when any local tool is called,
  then the host's own sandbox opens the session, never MXC.
