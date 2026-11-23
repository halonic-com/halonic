# runtime.worker-models

- Status: active
- Since: unreleased
- Source: HAL-17039, part b2 of the plan on HAL-13210

The Worker shall pick the model of each model call from the hub's definitions in the run-definitions index of the snapshot this Worker version serves, as a computer picks it from the workspace's files: the call's alias, else its agent's `model`, else the hub's default model; a `provider/model` name directly; the alias's fallbacks, params and price; and the provider file the alias names. The workspace shall count as trusted, because its deployer deployed it, so a provider's key may go to the address its provider file names. That trust shall cover only the deployer's files: a call with the agent editor's unsaved model settings shall be refused before any model is resolved, because they name their own address and secret. A provider's key shall be read from the Workers secrets by the name its provider file gives, on each call. When the hub has no such alias, or the alias names a provider the hub doesn't have, the call shall fail with the same error a computer gives; when the index has no such hub, it shall fail as not found.

Rationale: a run on Cloudflare must call the models its deployer configured, with the keys the deployer set as Workers secrets, and decide which key may go where by the same rule as on a laptop.

## Examples

- Given an index whose `acme` hub has the `writer` agent with `model: smart`, `smart` at the `globex` provider falling back to `fast`, when the writer calls a model, then the call gets `globex`'s model with the secret name `globex-key`, `smart`'s price and the `fast` fallback.
- Given the same index and the Workers secret `globex-key`, when the call is sent, then it goes to the address `globex`'s provider file names with that key.
- Given the same index, when a call names the alias `constructor`, then it fails as an unknown alias; when it names the hub `initech`, then it fails as not found.
- Given the same index, when a call carries unsaved model settings that send `globex-key` to another address, then the call is refused and nothing is sent.
