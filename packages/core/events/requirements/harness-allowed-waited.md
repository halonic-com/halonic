# events.harness-allowed-waited

- Status: active
- Since: unreleased
- Source: HAL-16473, for the model-mix trials of HAL-16440 (Liam's task: how long each tool-permission round trip takes)

The `harness.allowed` event (`events.harness-allowed`) shall be able to say in an optional `waitedMs` how long, in whole milliseconds, Halonic took from the bridge getting the program's ask to its answer. The field shall add no cost or token use, and logs written before it existed shall stay valid and read without it.

## Examples

- Given the type of `harness.allowed`,
  when `waitedMs` is checked,
  then it is an optional number.
- Given a `harness.allowed` log line with `waitedMs: 12`,
  when the line is parsed,
  then it comes back with `waitedMs: 12`.
- Given a `harness.allowed` log line written before `waitedMs` existed,
  when the line is parsed,
  then it reads as before, with no `waitedMs`.
- Given a run summary,
  when a `harness.allowed` with a `waitedMs` is added,
  then its cost, use and waiting approvals don't change.
