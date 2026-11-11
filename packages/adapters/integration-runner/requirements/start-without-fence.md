# integration-runner.start-without-fence

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, section 4.3, the confirmed path without the fence; ADR 2026-11-11-sandbox-without-fence)

When Halonic starts a runner through the launcher's sandbox (`sandbox-host`), on the path the user confirmed without the fence, the start shall be the same as inside the fence: the same untrusted profile, Node with its permission model reading only the runner and the integration's folder, and a fresh nonce. Node's permission model is then the only layer, so the runner shall report the session's fence proof as `off`, never as `fenced`. Closing the runner, or the runner stopping by itself, shall stop it and close the session.

## Examples

- Given the launcher's sandbox and the built runner,
  when Halonic starts the runner for an integration and calls one of its tools,
  then the tool answers and the runner's fence proof is `off`.
- Given an integration that asks Node for its file system binding, which only Node's
  permission model refuses,
  when it runs through the launcher's sandbox,
  then the call fails with Node's refusal.
- Given a runner started through the launcher's sandbox,
  when Halonic closes it,
  then the runner stops with `closed`.
