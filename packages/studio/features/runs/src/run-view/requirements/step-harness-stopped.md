# runs.run-view.step-harness-stopped

- Status: active
- Since: unreleased
- Source: HAL-15988, follow-up to HAL-15968 (Liam's point 7), event `events.harness-stopped`; words decided by the team (Sofia, HAL-15988)

When a step's log has a `harness.stopped` event (`events.harness-stopped`) with the reason `no-exit-after-result`, the step panel (`runs.run-view.step-events`) shall show one quiet line for it after the step's model and tool calls: "Claude Code gave its result but didn't stop on its own, so Halonic stopped it after 10 seconds. The step kept its result.", where Claude Code is the harness's name (an unknown harness id with its first letter made a capital, escaped) and 10 seconds is `afterMs` in whole seconds, at least 1 ("1 second"). The line shall have no ✕ and no icon, shall not change the step's or the run's status, and shall not be announced. An event with another reason shall get no line in the panel.

## Examples

- Given step Draft's Claude Code agent gave its result and Halonic stopped it after 10 seconds,
  when the person opens Draft's entry,
  then after its calls the panel reads "Claude Code gave its result but didn't stop on its own, so Halonic stopped it after 10 seconds. The step kept its result.", and Draft still shows as done.
- Given the event's `afterMs` is 1000, then the line says "after 1 second".
- Given the event's harness is `acme-harness`, then the line starts "Acme-harness gave its result".
- Given the event's reason is one Studio doesn't know, then the panel shows no line, and the run log still shows the event.
