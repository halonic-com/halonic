# runtime.worker-bridge-services

- Status: active
- Since: unreleased
- Source: HAL-18275 (B1b-2b of the plan on HAL-18020), scope approved on HAL-18274

When a harness step's bridge opens on the Worker, the Worker shall decide what it serves with the host's `ProviderKeyServices` on the workspace the deployer uploaded, as a deployment with many users: the key of the provider the agent's model points to, read from the Workers secrets. The bridge shall read only a secret that a provider file of that workspace names, never any other Workers secret, and every value it was given shall be removed from a bridge failure before the run log gets it. The bridge shall never reach a provider with the program's own sign-in: a provider without a key is left out, so the bridge refuses it, and an agent with no keyed provider is refused before its program starts. It shall offer no Halonic tools, and it shall refuse every approval, because no person can be asked on a cloud run yet.

Rationale: the program in the run container is not trusted. The Workers secrets also hold the token key and the sign-in password hash, so the bridge may reach only the keys the deployer gave the workspace's providers. A cloud run serves many people and its container holds no sign-in of the deployer's, so a sign-in would either fail or spend someone else's account.

## Examples

- Given the `acme` workspace whose `claude` provider names `anthropic-key`, when the bridge of a Claude Code agent asks for `token-key`, then it gets nothing; when it asks for `anthropic-key`, it gets the value.
- Given that value was given to the bridge, when a bridge failure quotes it, then the scrubbed text holds no part of it.
- Given the same workspace, when the agent's bridge opens, then it serves `anthropic` with the `claude` key and leaves `openai` out.
- Given a workspace with no keyed Anthropic provider, when a Claude Code agent's bridge opens, then it is refused, and the message names the deployment and how to add a key.
