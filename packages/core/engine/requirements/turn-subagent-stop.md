# engine.turn-subagent-stop

- Status: active
- Since: 0.1.0
- Source: HAL-3361 (subagents wait for an OK and for the effect step, design reviewed on HAL-4700); plan row E5 on HAL-9

When a `delegate_*` call in a run's model turn hands its task to a subagent whose own turn stops, the engine shall stop the delegating turn at that call as well, with what the subagent stopped for (`approval`, or `effect` with its connector), the subagent's tool and arguments, and a `resume` whose `calls` start with the `delegate_*` call and whose `inner` holds the subagent's id and its own `resume`, nested as deep as the delegation. The engine shall not log `agent.finished` for a subagent that stopped. The `approval.requested` or `effect.requested` event of such a stop shall name the innermost subagent in `subagent`, and keep the state's agent in `agent`. A chat turn whose `delegate_*` call's subagent stops shall fail, as a chat turn whose check asks a person does (`engine.turn-approval-stop`).

## Examples

- Given a `writer` whose model calls `lookup`, `delegate_checker` and `lookup`, and a `checker` whose model calls `publish`, which asks a person,
  when the `writer`'s turn runs,
  then the first `lookup` runs, the turn stops with `{ type: "approval", tool: "publish" }`, its `resume.calls` are the `delegate_checker` call and the second `lookup`, its `resume.inner` is `checker` with the `checker`'s own stop, and no `agent.finished` is logged.
- Given a `writer` that delegates to a `checker` that delegates to a `reader`, whose turn stops before `send_mail` on `mail` for the engine to make,
  when the `writer`'s turn runs,
  then it stops with `{ type: "effect", connector: "mail", tool: "send_mail" }`, and its `resume.inner` holds `checker`, whose own `inner` holds `reader`.
- Given that stop,
  when the engine records it,
  then its `effect.requested` names `writer` in `agent` and `reader` in `subagent`.
- Given a chat turn whose model calls `delegate_checker`, and a `checker` that stops,
  when the turn runs,
  then it fails, saying that only a run can wait.
