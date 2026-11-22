# harness-host.allowed-scrub

- Status: active
- Since: unreleased
- Source: HAL-15287, from Liam's review of #4505

When the harness host writes a `harness.allowed` for a call an agent's `asks: in-sandbox` let through (`harness-host.sandboxed-asks`), it shall first remove from its `detail`, the path or command, every value its `scrub` removes from a `bridge.failed`'s message, so a key a command names reaches the run log no more than one a provider's error quotes.

## Examples

- Given the writer with `asks: in-sandbox`, a fenced session and a host whose `scrub` knows a provider key,
  when Claude Code runs a command that names that key,
  then the run log has `harness.allowed` for `Bash` with the key replaced as `scrub` replaces it.
