# app.runner-start-gate

- Status: active
- Since: 0.1.0
- Source: HAL-983; I5 design 4.2 and 4.3 on HAL-958; seams 1 and 3 of the HAL-3386 test plan

The app shall start plugin and integration code only through one gate, which at every start asks the fenced sandbox's check again and decides with `UnfencedRuns`, never from what a dialog showed. When the decision is `fenced`, the gate shall start the code in the fenced sandbox and stop it again, reporting `stopped`, if the session's fence proof isn't `fenced`; it never falls back to the launcher then. When the decision is `allowed`, it shall start the code in the launcher's sandbox, refuse a launcher whose fence proof isn't `off`, and register the run so Take back stops it. A run that started while Take back ran shall be stopped. When the decision is `needs-yes` or `stopped`, nothing shall start.

On Windows 11, when the sandbox choice has MXC in use and `mxcFencesRunner` is on, the gate shall use `sandbox-mxc` as the fenced sandbox, ask its check, and tell the start which backend it is, so the start builds that backend's profile. `mxcFencesRunner` stays off until the attack cases A1 to A40 have passed on MXC on `windows-11-arm`, A6 and A23 included, and Julian's review is on HAL-3307 (HAL-3403). While it is off, Windows is `not-fenced` for `windows` as before.

## Examples

- Given a computer that passes the sandbox check,
  when the code starts and its fence proof is `fenced`,
  then it runs in the fenced sandbox.
- Given a computer that passes the sandbox check and a saved yes,
  when the fence proof fails at the start,
  then the runner is stopped, the result is `stopped` and the launcher starts nothing.
- Given the status `not-fenced` for `container` and no yes for it,
  then nothing starts and the result is `needs-yes` for `container`.
- Given a saved yes for `container` and that status,
  when the code starts,
  then it runs in the launcher's sandbox, and Take back stops it.
- Given Windows, where the sandbox check passes,
  then the fenced sandbox is never used and the reason is `windows`.
- Given Take back while a run without the sandbox is starting,
  then that run is stopped and the result is `needs-yes`.
- Given Windows 11 with MXC in use and `mxcFencesRunner` on,
  when the code starts and its fence proof is `fenced`,
  then it runs in `sandbox-mxc`, and the start is told the backend is `mxc`.
- Given Windows 11 with MXC in use and `mxcFencesRunner` off,
  then the status is `not-fenced` for `windows`, as before.
- Given MXC's fence failing after its check passed (A23),
  then the runner is stopped, the result is `stopped` and the launcher starts nothing.
