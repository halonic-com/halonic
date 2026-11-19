# app.plugin-local-tool-release

- Status: active
- Since: unreleased
- Source: HAL-12343 (wiring local tools into the apps: each session's folders are removed when it ends); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 4

When the host's `prepare` gives a `release` with a local tool's session, the app shall call it exactly once for that session: after the session and its connector have closed, whether the connector was closed or the session ended and was retired, or as soon as the session fails to open or start, including when it was prepared under another connector id, the sandbox refused to open it, or its fence proof is not `fenced`. A `release` that fails shall not change the error the call fails with.

## Examples

- Given a local tool whose session is open,
  when its connector is closed twice,
  then its `release` is called once, after the connector and the session have closed.
- Given a session that ended during a call,
  when the next call opens a new session,
  then the ended session's `release` has been called, and the new one's is called when the connector closes.
- Given a session whose fence proof is `off`,
  when a call opens it,
  then the call fails with `sandbox-not-fenced` and the session's `release` is called.
- Given a `release` that fails,
  when a session's fence proof is `not-fenced`,
  then the call still fails with `sandbox-not-fenced`.
