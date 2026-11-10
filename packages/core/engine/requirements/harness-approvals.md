# engine.harness-approvals

- Status: active
- Since: 0.1.0
- Source: HAL-189, step 4g (Liam's decision on HAL-3789)

When the harness of a task state's agent asks for a person's OK while it runs, the engine shall keep the harness call running, with its sandbox and bridge open, and shall record `approval.requested` under a call id it makes itself (`call-<n>`, unique in the run), not the id the harness gave the approval, with an empty `resume`, followed by `run.waiting` for `approve` and `reject`. The engine shall record the question only once every event the harness and the bridge reported before it is in the log. An event the bridge or the sandbox reports while the run waits shall be recorded after `approval.resolved`, under the call that goes on; if the call stops instead, it shall be dropped with the call. When a person sends `approve` or `reject`, the engine shall record `event.received` and `approval.resolved` as for any approval, and shall pass the answer and the person's comment to the harness call that asked, under the harness's own id for the approval, instead of asking for a model call. From then on the run shall wait on that harness call under the next call id, so the call can ask again, one approval at a time. A `send` that names a call id shall name the engine's, never the harness's. While the run waits for a person, no time limit shall run. When the engine stops while the run waits, it shall stop the harness call as it stops any other, and the run shall stay waiting. When the answer comes and no harness call of the engine waits for it, as after a restart, the run shall end with `reason: "interrupted"`, and the engine shall start no harness and no model call for it. A question from any call the state doesn't wait on, or from a call of Halonic's own loop, shall change nothing. When the run doesn't take the question, as from the harness of an item of a `foreach` state, the harness call shall fail, so that the run never waits for an answer it can't get.

## Examples

- Given a `draft` task state whose `writer` agent runs in Claude Code as `call-1`,
  when the harness asks to run `rm -r drafts` under its own id `toolu_7`,
  then the engine records `approval.requested` for `Bash` with call id `call-2` and `run.waiting` for `approve` and `reject`, and the harness, its session and its bridge stay open.
- Given that run,
  when `approve` is sent for `call-2` with the payload `{ comment: "Fine" }`,
  then the engine records `event.received` and `approval.resolved`, the harness gets `{ type: "approval", callId: "toolu_7", approved: true, comment: "Fine" }`, and the run waits on `call-3`.
- Given that run, where the bridge reports a `tool.called` and the sandbox blocks `api.example.com:443` while it waits,
  when `approve` is sent for `call-2`,
  then the engine records `approval.resolved` before the `tool.called` and the `sandbox.blocked`, and the run completes.
- Given that run,
  when `approve` is sent for `toolu_7`,
  then the engine refuses it with `engine.decision-callid-must-match` and records nothing.
- Given that run after `call-3` asks again and the person rejects `call-4`,
  when the harness reports its own `agent.finished` with `Left the drafts alone`,
  then the engine records `agent.finished` and moves on as for any answer.
- Given a run waiting on `call-2` whose engine stopped,
  when a new engine on the same store gets `approve` for `call-2`,
  then the run ends with `run.failed` and `reason: "interrupted"`, and nothing is started.
- Given a `triage` foreach state whose `writer` agent runs in Claude Code for one item as `call-1`,
  when the harness asks to run `rm -r drafts`,
  then the harness call fails, the run fails with an error that names `writer` and `Bash`, and the harness, its session and its bridge are closed.
