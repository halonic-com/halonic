# app.doctor-harness-web-search

- Status: active
- Since: unreleased
- Source: HAL-13603, Liam's approval on HAL-13604 (Julian's note on HAL-13590)

While an agent of the workspace runs in a harness other than Halonic's own loop, and its `model` is an alias its hub can use whose target model is listed in that provider file's `searchesWeb`, the Harnesses line of `halonic doctor` shall be marked as a warning, with one problem per such agent naming the agent, the alias, the model and the provider, and a fix that points the alias at another model. The match shall be exact, as `format.provider-searches-web` says. A `provider/model` name, a name the harness program knows itself, and the alias's fallbacks shall not count, as none of them reach the model through the bridge. The warning shall never mark the line as failed, so `doctor` shall still exit 0.

## Examples

- Given Writer runs in Claude Code with `model: research`, and `research` points at `perplexity/sonar` at OpenRouter, whose file lists `searchesWeb: [perplexity/sonar]`,
  then the Harnesses line is ! with "Writer uses research (perplexity/sonar at OpenRouter), which searches the web by itself, outside Halonic's tools and approvals." and `doctor` exits 0.
- Given the hub Support points `research` at another model, and its agent Helper uses `research`,
  then Helper isn't named, while an agent of a hub without its own `research` is.
- Given an agent in Halonic's own loop with `model: research`,
  then it isn't named.
- Given a harness agent with `model: openrouter/perplexity/sonar`, or an alias whose model is `Perplexity/Sonar`,
  then it isn't named.
- Given a harness agent whose alias's only fallback is `research`,
  then it isn't named.
