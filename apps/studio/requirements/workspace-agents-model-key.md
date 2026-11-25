# studio.workspace-agents-model-key

- Status: draft
- Since: unreleased
- Source: HAL-18927; states (HAL-5896) section 4, H19; `agents.chat.model-key`; the Build chat's Model menu (`assistant.chat.model-line`), which asks the same way

When the desktop app gives the Agents feature a folder's agents, it shall tell, for an agent on Halonic's own loop, whether the agent's model needs an API key that isn't stored on this computer: its own model, else its hub's or the workspace's default, resolved to its provider. It shall answer the model's name, the provider's name and the name the key is stored under, and never the key. It shall answer nothing for a model whose key is stored, a provider without a key, a model or provider the workspace doesn't have, or an agent that runs in a program with its own sign-in such as Claude Code. Where keys can't be asked, the agents shall have no such answer.

## Examples

- Given the agent Writer on `fast`, an alias of the provider Anthropic whose key `anthropic-api-key` isn't stored, when the Agents feature asks, then the answer is `fast`, Anthropic and `anthropic-api-key`.
- Given that key stored, when it asks again, then there is no answer.
- Given Writer on Claude Code, when it asks, then there is no answer.
