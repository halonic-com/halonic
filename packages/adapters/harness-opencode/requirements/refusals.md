# harness-opencode.refusals

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan, approved by Liam: Linux only and `asks: in-sandbox` only in v1); HAL-18152

Before anything starts, the OpenCode harness shall refuse a run on any computer other than Linux, a run for an agent whose file doesn't say `asks: in-sandbox`, and a run in a session the fence proof doesn't say is `fenced`. Each refusal shall say what to change.

## Examples

- Given a fenced session on macOS,
  when an OpenCode run is asked for,
  then it is refused with "OpenCode runs only on Linux for now.".
- Given an agent with `asks: always` on Linux,
  when an OpenCode run is asked for,
  then it is refused and names `asks: in-sandbox`.
