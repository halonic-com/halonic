# engine.bridge-approvals

- Status: active
- Since: unreleased
- Source: HAL-10849 (Liam's decision on HAL-10847)

The engine shall give the host the approvals of one run's bridge, for what the harness's program or a Halonic tool needs a person's OK for. A request shall be recorded in the run as `approval.requested` under a call id the engine makes itself (`call-<n>`), not the bridge's, followed by `run.waiting` for `approve` and `reject`, as for an approval the harness itself asks for (`engine.harness-approvals`). The request shall resolve with the person's answer and comment when `approve` or `reject` is sent for that call id; the run's checks shall refuse an unknown or an already answered call id, so the first answer wins and a later one changes nothing. Requests of one run shall wait one at a time, in the order they came. The engine shall never answer yes by itself: a request with no harness call of the run going on (the run ended, the engine stopped, or the call is gone), with more than one going on, or that the run can't wait for, shall resolve as not approved, and a request whose signal aborts shall reject. The run keeps a question that was withdrawn this way until a person answers it.

## Examples

- Given a run whose Claude Code call is going on,
  when its bridge asks to run `rm -r drafts`,
  then the engine records `approval.requested` for `Bash` with call id `call-2`, and the request waits.
- Given that request,
  when `approve` is sent for `call-2` with the payload `{ comment: "Fine" }`,
  then the request resolves with `{ approved: true, comment: "Fine" }`, and the run waits on `call-3`.
- Given that request,
  when a card and a phone send `approve` and `reject` for `call-2` at once,
  then one is taken and the other is refused, and the request resolves with the one taken.
- Given that request,
  when `approve` is sent for a call id the run never asked for, or for `call-2` after it was answered,
  then the send is refused and records nothing.
- Given a run that was cancelled or whose engine stopped,
  when its bridge asks again, or was waiting for an answer,
  then the request is not approved.
