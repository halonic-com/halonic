# studio.workspace-agents-alias-line

- Status: draft
- Since: unreleased
- Source: HAL-18929; UX checklist 2.5 (HAL-1323); microcopy 8.5; `agents.configuration.alias-line`

When the desktop app gives the Agents feature a folder's agents, it shall tell, for a model alias the agent's hub can use, the alias's provider by its name (by its id only when the workspace has no file for it), the model at the provider and what the alias costs: its input and output price per million tokens in the currency of `workspace.yaml`'s budget, euros when it names none; the built-in test model, which costs nothing; a provider on this computer, when the alias has no price; or no price. It shall answer nothing for an alias the hub doesn't have.

## Examples

- Given `smart` at the provider Anthropic's `claude-sonnet` for 3 in and 15 out, and no budget currency, when the Agents feature asks, then the answer is Anthropic, `claude-sonnet` and €3.00 in, €15.00 out.
- Given the budget's currency is USD, then the price is $3.00 in, $15.00 out.
- Given `fast` without a price, then the answer says it has no price.
- Given `local` at a provider with `local: true` and no price, then the answer says it runs on this computer.
- Given `test` at a provider of type `mock`, then the answer says it is the built-in test model.
- Given `smrt`, which the hub doesn't have, then there is no answer.
