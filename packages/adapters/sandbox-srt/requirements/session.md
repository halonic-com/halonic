# sandbox-srt.session

- Status: active
- Since: 0.1.0
- Source: HAL-193 (plan phase 3, v1.17), HAL-2554

The sandbox-srt adapter shall open a session that proves its fence before anything runs (a canary file the fence hides and a loopback port it blocks), start programs only inside a proven fence, give each session its own private settings folder, give the launcher outside the fence only the host's absolute PATH and TMPDIR, set the profile's environment (never a proxy variable) only inside the fence on top of the proxy variables sandbox-runtime sets there, so the program reaches the bridge and nothing else on the host, and stop the program and everything it started on `kill`, `close`, the time limit or an aborted signal.

## Examples

- Given a fence that lets a program read the canary file,
  when a session is opened,
  then the fence is `not-fenced` with a reason and `start` throws.
- Given a host with `HTTPS_PROXY` set,
  when a program is started,
  then neither the program nor the probe sees a proxy variable.
- Given a bridge on a loopback port and another service on a second loopback port,
  when a program in the session asks both through the fence's proxy,
  then it reaches the bridge and not the other service.
- Given a bridge on `10.0.0.5`,
  when a session is opened,
  then opening fails and nothing runs.
- Given a time limit of five seconds and a program that never ends,
  when the limit runs out,
  then the program is killed with the reason `timeout` and the session is stopped.
