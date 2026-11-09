# ports.harness-stream

- Status: draft
- Since: 0.1.0
- Source: plan HAL-9 section 4.5 (v1.17); HAL-1484. Proven by the `harness` contract suite, which comes with the first adapter (phase 3, HAL-194)

When a harness run ends normally, its stream shall end with exactly one `agent.finished` for the task's agent, without a `parent`, and yield nothing after it. If the run fails or is cancelled, then the stream shall end with an error and no `agent.finished`, and `cancel` shall resolve only once every program the run started has stopped. A harness shall record each model call and tool call once: it shall not report a call that went through the Halonic bridge, which records those itself. A harness shall never put the bridge's token in an event or an error.

## Examples

- Given a harness run that finishes,
  when its stream is read to the end,
  then the last event is the task agent's `agent.finished`.
- Given a harness run that is cancelled while its program runs,
  when `cancel` resolves,
  then the stream has ended with an error and the program is no longer running.
- Given a program whose model calls all go through the bridge,
  when the run's log is read,
  then each model call appears once, as the bridge recorded it.
- Given a program that fails with an error message containing the bridge token,
  when the stream ends with that error,
  then the error doesn't contain the token.
