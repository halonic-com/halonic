# engine.remote-decision

- Status: active
- Since: unreleased
- Source: HAL-10852, relay part 2 of HAL-10833 (Liam's conditions on HAL-10835 and HAL-10847)

When `approve` or `reject` is sent to a run with `by: "remote-device"`, the engine shall take it exactly as it takes the same send without `by`, from a card click: the same call id check, the same refusals, the same events and the same answer to the harness call, and shall record `by: "remote-device"` on `approval.resolved` instead of `by: "person"`. Only the host that calls `send` sets `by`; the engine reads it from the send options and from nothing a phone sent. The first answer for an approval wins: when two answers for it arrive at once, the engine takes the one it records first and refuses the other with `engine.decision-callid-must-match`, and records nothing for it. An answer for an id the run doesn't wait on, or for one that was already answered, is refused the same way; an answer to a run that has ended is refused with `engine.run-ended`. A refused answer reaches no harness.

## Examples

- Given a run waiting for the approval of `call-2` that a Codex harness asked for as `toolu_7`,
  when `approve` is sent for `call-2` with `by: "remote-device"`,
  then the engine records `approval.resolved` with `by: "remote-device"` and the harness gets `{ type: "approval", callId: "toolu_7", approved: true }`.
- Given that run,
  when `reject` is sent with `by: "remote-device"`,
  then the harness gets `approved: false` and the log says `by: "remote-device"`.
- Given that run,
  when a card click and a remote decision for `call-2` arrive at once,
  then one is recorded and answers the harness once, and the other is refused with `engine.decision-callid-must-match`.
- Given that run after `call-2` was answered and the harness asked again as `call-4`,
  when a remote `approve` for `call-2` arrives,
  then it is refused with `engine.decision-callid-must-match`, nothing is recorded and the harness hears nothing.
- Given that run after it ended,
  when a remote `approve` for `call-2` arrives,
  then it is refused with `engine.run-ended`, nothing is recorded and the harness hears nothing.
- Given a send of `approve` without `by`,
  when the run records it,
  then `approval.resolved` says `by: "person"`.
