# engine.turn-subagent-go-on

- Status: active
- Since: 0.1.0
- Source: HAL-3361 (subagents wait for an OK and for the effect step, design reviewed on HAL-4700, PR 2 reviewed on HAL-4827); plan row E5 on HAL-9

When a run's model turn goes on from a stop whose `resume` has `inner` (`engine.turn-subagent-stop`), the engine shall give the person's answer, or the result of the call the engine made, to the innermost subagent, from that subagent's own `resume`, and go on in it as a stopped turn goes on (`engine.turn-approval-stop`, `engine.connector-effects`). A subagent's answer shall answer the `delegate_*` call it stopped in, one level up, until the state's agent goes on with the rest of its calls. A subagent that stops again shall stop the state's agent's turn again, at the same `delegate_*` call. Going on shall log neither a second `agent.started` nor a second `tool.called` for a `delegate_*` call; it logs the call's `tool.result` and the subagent's `agent.finished` once the subagent answers. Each level of `inner` shall hold only its own agent's conversation. The `tool.called` and `tool.result` of a call the engine makes for a subagent shall name the innermost subagent in `agent`.

## Examples

- Given a `writer` that stopped inside its `checker`, which stopped inside its `reader`, before `publish`, which asks a person,
  when the person approves and the engine goes on after a restart,
  then `publish` runs once in the `reader`, the `reader`'s answer answers `delegate_reader`, the `checker`'s answers `delegate_checker`, the `writer` answers, and the log has no `agent.started`.
- Given that stop,
  when the person rejects it,
  then the `reader`'s model gets the rejection as the result of `publish`, and nothing runs.
- Given a `writer` stopped two levels deep before the `reader`'s `send_mail`, which the engine makes,
  when the engine goes on with the call's result,
  then the `reader`'s model gets that result, and the call isn't made again.
- Given that the `reader` calls `publish` again after the OK,
  when the engine goes on,
  then the `writer`'s turn stops again, with `inner` two levels deep and the `reader`'s new call first.
- Given a stop for `send_mail` inside the `reader`,
  when the engine makes the call,
  then its `tool.called` and `tool.result` name `reader`, and the `writer` goes on with the result.
