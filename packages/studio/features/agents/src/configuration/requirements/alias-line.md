# agents.configuration.alias-line

- Status: draft
- Since: unreleased
- Source: HAL-18929 (T6 gap 4 on HAL-17270); UX checklist 2.5 (HAL-1323, T6-F24); microcopy 8.5 and L3; ModelsService.openAlias (HAL-17481); HAL-19087

While the agent's model is an alias of its hub and the agents host can tell, the Model page shall show under the picker the line "**smart** · Anthropic / claude-sonnet-5-5 · €3.00 in, €15.00 out per million tokens": the alias's name, its provider by name, never its id, the model at the provider, and its price per million tokens in the workspace's currency. Where the alias has no price the line shall end "No price · **Add a price**"; for a provider on this computer without a price, "On this computer, no cost"; and for the built-in test model, "Built-in test model, no cost". For an agent on Claude Code or Codex, which runs on the program's own subscription, the line shall end "On your Claude subscription, not priced" or "On your ChatGPT subscription, not priced" in place of the price or "No price · **Add a price**". The alias's name shall open the alias's tab on Models through `ModelsService.openAlias`, and **Add a price** shall open it with its price field focused. A `provider/model` name, an alias the hub doesn't have, an empty pick and a host that can't tell shall show no line, and the line shall follow the pick.

## Examples

- Given Sorter's model is smart, at Anthropic's claude-sonnet-5-5 for €3 in and €15 out, then the line reads "smart · Anthropic / claude-sonnet-5-5 · €3.00 in, €15.00 out per million tokens", and clicking smart opens smart on Models.
- Given the alias fast has no price, then the line ends "No price · Add a price", and Add a price opens fast on Models at its price.
- Given the alias local points at an Ollama provider on this computer with no price, then the line ends "On this computer, no cost".
- Given the alias test points at the built-in test model, then the line ends "Built-in test model, no cost".
- Given Sorter runs on Claude Code with smart, then the line reads "smart · Anthropic / claude-sonnet-5-5 · On your Claude subscription, not priced", with no Add a price.
- Given the file names ollama/llama3.2, then no line shows under the picker.
- Given the person picks fast instead of smart, then the line says fast's provider, model and price.
