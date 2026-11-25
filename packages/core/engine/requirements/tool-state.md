# engine.tool-state

- Status: active
- Since: unreleased
- Source: HAL-18635 (S12 of HAL-18490, on the PR watcher's critical path, HAL-17974), with the plan rev 1 approved there

When a run enters a `tool` state, the engine shall call the state's tool with no model call, going through the same checks, records and approvals as an agent's call to that tool. As the state is entered, the run shall fail, before any connector is listed or called, when the state names no `connector`, no `tool` or no `output`, when the run's definitions hold no `tools` lists for the connector, or when the connector's `tools.allow` exists and doesn't name the tool, with an error that names the step, the tool and the connector. The engine shall then check the call on the run's connectors as a run's model call checks an agent's (`runToolCheckOf`, with the connector's listing, its sheet, the person's approvals of listed tools, the `approve` and `read` lists and the tool's parameters), with the arguments the state's `with` renders against the run. When the check refuses the call, or the tool is labelled `send` and the connector may not send, the run shall fail with an error that names the step, the tool and why. When the check asks a person, the engine shall record `approval.requested` with the rendered arguments and `step: "tool"`, and wait for `approve` or `reject`; `approve` shall make the call with the arguments the approval recorded, never rendered again, and `reject` shall finish the state with `rejected`. When the check lets the call run, or a person approved it, the engine shall record `effect.requested` with `step: "tool"` and the key `<runId>:<callId>`, `connector.started` and `tool.called`, then make the call with the `call-tool` effect, as for an agent. When the call has a result, the engine shall log `tool.result`, write the result to the state's `output` (as JSON when it reads as JSON, else as the text), send the state's `signal` if it has one, and finish the state with `done`. A call whose outcome is `error` shall fail the run with the tool's text. A call whose outcome is `unknown` shall make the run wait for `retry` or `skip`; `retry` shall make the call again under the same key, and `skip` shall finish the state with `skipped`. A tool step's approval or result shall never set up a model call. A local executor given no `connectorCalls` shall fail the run at its first tool step with `This engine makes no connector calls`. A check result or tool result for a call the run no longer waits on shall change nothing, so a timer delivered twice makes one call.

Rationale: a no-model routine, such as the PR watcher, acts on its rule's decisions, and a tool step can call nothing, and skip no person's OK, that an agent's call couldn't.

## Examples

- Given the rule step `match`, the tool step `merge` with `with: { pr: "{{context.decisions.merge}}" }`, and an engine whose model calls fail,
  when the run starts,
  then the connector gets `merge_pull_request` with `{ pr: 7 }` and the key `run_1:call-1`, `tool.result` is logged and the run completes.
- Given a connector whose `tools.allow` doesn't name `merge_pull_request`,
  when the run reaches the tool step,
  then it fails with `Tool step "merge" calls merge_pull_request, which the tools.allow list of connector "github" doesn't name.`, and the connector was neither listed nor called.
- Given a tool the connector's `read` list doesn't name, or one its server lists as `send`,
  when the run reaches the tool step,
  then it waits with `approval.requested` and `run.waiting [approve, reject]`, `approve` makes the call once, and `reject` takes the `rejected` transition.
- Given a call that broke off,
  when a person sends `retry`,
  then the call is made again under the same key, once.
