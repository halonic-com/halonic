# engine.task-approvals

- Status: active
- Since: 0.1.0
- Source: HAL-1529, step 4(b) of the HAL-186 plan; E5 and HAL-1257

When a task state's agent stops at a tool call that needs a person's OK, the engine shall record `approval.requested` under a call id it makes itself (`call-<n>`, unique in the run), not the id the model gave the call, and shall record `run.waiting` for `approve` and `reject`. When a person sends `approve` or `reject`, for that call id or without one, the engine shall record `event.received` and `approval.resolved` with `approved`, the person's `comment` when the payload has one, and `by: "person"`, and shall ask for a new model call under the next call id that goes on from where the agent stopped, with the answer. A result for any call the state doesn't wait on shall change nothing.

## Examples

- Given a `draft` task state whose agent was asked `call-1`,
  when `call-1` stops at `send_mail` with the model's id `m-7`,
  then the engine records `approval.requested` for `send_mail` with call id `call-2` and `run.waiting` for `approve` and `reject`.
- Given that run,
  when `approve` is sent for `call-2` with the payload `{ comment: "Fine" }`,
  then the engine records `event.received` and `approval.resolved` for `call-2` with `approved: true`, comment `Fine` and `by: "person"`, and asks for `call-3`, which goes on from where the agent stopped, approved.
- Given that run,
  when `reject` is sent without a call id,
  then the engine resolves `call-2` with `approved: false` and asks for `call-3`, which goes on rejected.
- Given that run,
  when `approve` is sent for `call-1`,
  then the engine refuses it with `engine.decision-callid-must-match` and records nothing.
- Given that run after `call-3` answers `Sent`,
  then the engine records `agent.finished` and moves on as for any answer.
