# cli.run-view-agent-step-model

- Status: draft
- Since: unreleased
- Source: HAL-15639 (flow check C605 #3 on HAL-15625); `cli.run-view`; `cli.run-live`

When the `halonic` command names what ran a step (`halonic run`'s live and finished step lines and `halonic runs show`), and the step calls one of its agent's agent steps (`method`) that names its own model, the line shall name that agent step's model alias, the one the engine calls the model with, after the agent's name; an agent step without its own model shall leave the agent's alias, or the default one, as before.

## Examples

- Given Acme's step Draft a reply calls Writer's agent step `short` with `model: tiny`, and Writer's own model is `smart`,
  when the finished run's steps are shown,
  then the line reads "✓ Draft a reply Writer · tiny 1 s", and while it runs, "Draft a reply Writer · tiny".
- Given the step calls Writer's agent step `long`, which names no model,
  when the run's steps are shown,
  then the line reads "✓ Draft a reply Writer · smart 1 s".
