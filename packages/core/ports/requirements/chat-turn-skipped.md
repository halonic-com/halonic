# ports.chat-turn-skipped

- Status: active
- Since: 0.1.0
- Source: [plan-providers](/HAL/issues/HAL-1061#document-plan-providers), question 1, approved on HAL-1880: a chat turn outside a run has no run log; an optional output field keeps version 1; `local-only` added on HAL-5922, decision note `decisions/elena/HAL-5922-02-local-only-engine.md`

The `RunExecutor` port's `ChatTurnResponse` shall let an executor return, in an optional `skipped`, the model aliases the turn skipped before calling them, in order, each with the `alias`, its `provider` and `model`, the `reason` (`no-key` or `local-only`) and, when there was one, the alias tried `next`: what an `llm.skipped` run log event says inside a run. A response without `skipped` shall still satisfy the port.

## Examples

- Given a `ChatTurnResponse` without `skipped`,
  when it is compiled,
  then it compiles.
- Given a `ChatTurnResponse` whose `skipped` holds "smart" with `reason: "no-key"` and `next: "default"`,
  when a status view reads it,
  then it gets the alias, the reason and the next alias.
- Given a `ChatTurnSkip` with `reason: "offline"`,
  when it is compiled,
  then it doesn't compile.
