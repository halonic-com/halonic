# agents.configuration.harness-model

- Status: draft
- Since: unreleased
- Source: HAL-18930 (T6 gap 5 on HAL-17270); flow 5.6, UX checklist 2.5 and F25; the check is `harnessModelFit` of `@halonicjs/adapter-workspace-models`, the pairs `halonic run` allows (`cli.harness-model-access`); OpenCode's sentence copies Claude Code's, decided by the team under the HAL-2282 rule

While the agent's model is an alias of its hub and the agents host tells how each harness gets on with the alias's provider, the Model page shall check the pick against the agent's harness. When the harness's program can't call the provider, the picker shall show the error "Claude Code can use Anthropic models only. Choose another." for a Claude Code agent, "This model can't be used with Codex. Choose another." for a Codex agent and "OpenCode can use Anthropic models only. Choose another." for an OpenCode agent. When a Codex agent's alias has an OpenAI-compatible provider, the page shall show "Make sure this endpoint supports the Responses API." under the alias line. An agent in Halonic's own loop, a provider the harness can call, an alias the hub doesn't have and a host that can't tell shall show neither. The error for an alias the hub doesn't have (`agents.configuration.model`) shall come first.

## Examples

- Given Coder runs in Codex and its model fast is an alias on an Anthropic provider, then the picker shows "This model can't be used with Codex. Choose another."
- Given Coder runs in Claude Code and its model gpt is an alias on an OpenAI provider, then the picker shows "Claude Code can use Anthropic models only. Choose another."
- Given Coder runs in Codex and its model gateway is an alias on an OpenAI-compatible provider, then the line under the picker ends with "Make sure this endpoint supports the Responses API."
- Given Coder runs in Halonic's own loop on any of these, then the page shows neither sentence.
