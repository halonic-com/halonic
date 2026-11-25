# harness-opencode.harness

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan, PR 4: wiring); HAL-18718

The OpenCode harness shall be a `Harness` with id `opencode` and name "OpenCode". Its `detect()` shall answer as `harness-opencode.detect` says, its `environment()` as `harness-opencode.environment` says for the task's model and the profile's folders, and its `start()` shall begin a run as `harness-opencode.run` says. It shall offer no sign-in, since the bridge holds the provider's key.

## Examples

- Given the harness made with a probe that finds OpenCode 2.3.0,
  when `detect()` answers,
  then it is `ready` with version 2.3.0 and the harness offers no sign-in.
- Given a bridge that keeps Anthropic's key and a task model,
  when the engine asks for the environment,
  then it holds `ANTHROPIC_API_KEY` set to the stand-in key and the folders sit inside the agent's settings folder.
