# app.sandbox-choice

- Status: active
- Since: 0.1.0
- Source: HAL-3306; docs/adr/2026-11-10-mxc-sandbox-backend.md ("Choosing a sandbox on Windows", "The trust check"); board decision HAL-2546; the plan on HAL-3292

The sandbox choice shall pick, on Windows, the person's explicit choice (an MXC setting of `on`) first, then srt when its check passes, then MXC when the MXC setting isn't set and the MXC default is on, and otherwise no sandbox; elsewhere srt when its check passes. An MXC setting that isn't set shall follow one MXC default, which is opt-in. Before MXC runs, the choice shall run MXC's trust check, at startup, after every change to the sandbox settings and when a session's fence proof is `not-fenced`. When the check fails, MXC shall be off until Halonic starts again, nothing shall run in another backend in its place, and the person's setting shall stay as they left it. The choice shall report the active backend and MXC's offer, setting, setting in effect and state as codes from closed lists, with the failed check's reason and the sentences behind it for logs.

## Examples

- Given a computer that doesn't offer MXC, or isn't Windows,
  then MXC is `not-offered`, no trust check runs and srt runs when its check passes.
- Given Windows 11, MXC not set and the default opt-in,
  then MXC is `off`, and with srt not working on Windows nothing runs.
- Given Windows 11, MXC not set, the default on and srt working on Windows,
  then srt runs and MXC is `not-used`.
- Given Windows 11, MXC set to `on` and srt working on Windows,
  then MXC is checked and runs, because the person chose it.
- Given MXC set to `on` and a trust check that fails with `too-strict`,
  then nothing runs, MXC is `mxc-check-failed` with `too-strict`, and the setting is still `on`.
- Given a trust check that failed in this start,
  then a settings change or a `not-fenced` session runs no new check and MXC stays off; a new start checks again.
- Given MXC in use and a session whose fence proof is `not-fenced`,
  then the trust check runs again, and MXC is off for this start if it fails.
- Given the MXC default constant,
  then it is `"opt-in"`.
