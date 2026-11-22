# harness-host.allowed-waited

- Status: active
- Since: unreleased
- Source: HAL-16473, for the model-mix trials of HAL-16440 (Liam's task: how long each tool-permission round trip takes)

When the in-sandbox mode of `harness-host.sandboxed-asks` lets a call through, the `harness.allowed` it writes shall hold `waitedMs`: the whole milliseconds from the bridge's approvals getting the ask to Halonic's answer, as the host's clock tells it, and never less than 0. Each ask shall be timed on its own, also while other asks of the same bridge are still being answered.

## Examples

- Given the writer with `asks: in-sandbox`, a fenced session and a clock that moves on 250 ms per reading,
  when Claude Code runs a command,
  then the run log has `harness.allowed` with `waitedMs: 250`.
- Given two asks of the same bridge, the first still resolving its path when the second comes in,
  when both are let through,
  then each `waitedMs` counts from its own ask.
- Given a clock that was set back while the ask was answered,
  when the call is let through,
  then `waitedMs` is 0.
