# harness-kit.event-filter

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan A1, C2 and D2; HAL-3587

The harness kit shall pass the events a harness reads from its program through one filter. The filter shall remove the run's bridge token from every string in an event, object keys and nested values included, and from the message of every error it makes. It shall let the task agent's `agent.finished` without a `parent` through once, as the final event, and no event after it. A subagent's `agent.finished` shall not count as the final one.

## Examples

- Given a `tool.result` whose result is `HALONIC_RUN_TOKEN=` and the token,
  when it passes,
  then its result is `HALONIC_RUN_TOKEN=[secret removed]`.
- Given `tool.called`, the final `agent.finished` and another `tool.called`,
  when they pass,
  then only the first two come through, and later events give none.
