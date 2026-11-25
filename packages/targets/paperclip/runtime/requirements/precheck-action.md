# runtime.precheck-action

- Status: active
- Since: unreleased
- Source: HAL-17969 (plan approved on the task: the port of Agent tools' `ready_for_review`, `paperclip.ready-for-review`, with the service's address from the plugin's settings)

The runtime shall ship a handler for `halonic.precheck` that, when a tool that runs it is called with a pushed branch and optionally its full commit id, starts a check of that branch at Halonic's precheck service without waiting for it, sending the branch and commit id in the request's JSON body, reads the check until it is done or about 6 seconds have passed, and answers `PASS`, `FAIL` with the failed steps, or with the service's reason when it stopped the check before any step ran, and the service's summary marked as log output and cut to 4,000 characters, or `RUNNING` with the check's id, which a later call passes instead of the branch to read that check. When the service is full, unreachable, slower than 2 seconds on one request, answers with a redirect, answers with more than 64 KB, or answers anything but a check or a refusal, it shall answer `CHECK UNAVAILABLE` and tell the agent to go on without it, never as an error. When the service refuses the input with `400`, it shall answer with an error that carries the service's reason marked as data and cut to 4,000 characters. It shall refuse without a request a missing branch, `main`, a short commit id or a malformed check id. It shall save each call's verdict and, for a finished check, the check's duration, tagged with the tool and the verdict.

The runtime shall take the service's address only from the plugin's `precheckUrl` setting, `http://halonic-precheck:8787` when it is empty, never from the workspace or the call. It shall check the setting when it reads the settings, allowing only `http` or `https` with a host and an optional port, and refusing an address with a user or a password, a path other than `/`, a query or a fragment; with a refused address, every call answers `CHECK UNAVAILABLE` and sends no request. It shall build each request as the checked origin plus `/check` or `/check/<id>`, with the id only after its format is checked, and it shall give the service client only to a call of `halonic.precheck`, to no other action.

## Examples

- Given a branch whose check passes on the second read,
  when Mateo calls `ready_for_review` with it,
  then the service gets one `POST /check` with `wait: false` and the branch in the body, and one read of the check, and the answer starts with `PASS`.
- Given a check that fails `format` and `typecheck-lint`,
  when the check is done,
  then the answer starts with `FAIL: format, typecheck-lint`, says to fix, push and call again, and carries the summary marked as data, not instructions.
- Given a check that is still running after about 6 seconds,
  when Mateo calls `ready_for_review`,
  then the answer is `RUNNING` with the check's id, and a later call with that `checkId` reads the check without starting a new one.
- Given a service that answers `429`, `302`, an answer of 100 KB, or doesn't answer within 2 seconds,
  when Mateo calls `ready_for_review`,
  then the answer is `CHECK UNAVAILABLE`, with no error, and saves the verdict `unavailable`.
- Given the setting `https://user:pw@precheck.acme.test`, `http://precheck.acme.test/x`, `http://precheck.acme.test?x=1`, `http://precheck.acme.test#x` or `file:precheck.json`,
  when Mateo calls `ready_for_review`,
  then the answer is `CHECK UNAVAILABLE` naming the setting, and no request is sent.
- Given `branch: "main"`, a 7-character `sha` or a `checkId` with a slash,
  when Mateo calls `ready_for_review`,
  then it answers with an error and sends no request.
- Given a tool that runs another action,
  when it is called,
  then its handler gets no precheck client.
