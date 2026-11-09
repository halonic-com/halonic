# ports.harness-control

- Status: active
- Since: 0.1.0
- Source: plan HAL-9 section 4.5 (v1.17), "Harness" port; HAL-1484

The `Harness` port shall start a run with `start(task, session, bridge)`, given the task, a `Sandbox` session and the Halonic bridge's address and run token, and return the run's events as a stream. While the run goes on, `send` shall pass it a person's answer or an approval decision, and `cancel` shall stop it. The built-in agent loop shall fit the same port.

## Examples

- Given a harness,
  when `start` is called with a task, a sandbox session and a bridge,
  then it returns a run that can be read with `for await` and has `send` and `cancel`.
- Given a running harness that asked for approval with `callId` "call_1",
  when `send` passes `{ type: "approval", callId: "call_1", approved: true }`,
  then it compiles; an approval without a `callId` doesn't.
- Given the built-in agent loop written as a harness that reports a model call, a tool call, an approval with `resume` and its result,
  when its run is read to the end,
  then it compiles against the port and its events arrive in order, ending with the agent's `agent.finished`.
