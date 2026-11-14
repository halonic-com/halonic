# server.chat-turn-model-address

- Status: active
- Since: 0.1.0
- Source: HAL-9483 (sign-off of HAL-196)

The server shall, for a chat turn whose `agent` settings name a `secret`, ask its `modelSettings` port whether the hub's workspace allows that pair of secret and address (`allows(hubId, agent)`), and when it doesn't, answer 400 `model_address_not_allowed` before the trust gate or the executor is asked, so no model request is made. Settings without a `secret` are not asked. The `halonic serve` command shall allow the pair only when a provider file of the workspace served now names that same secret, has the same `type` and calls the same address (`baseUrl`, else the type's own address, compared without a trailing slash); a hub the workspace doesn't have is refused. The workspace is read on each request, so a changed provider file applies at once.

Rationale: the host looks the secret up and sends its value to the address. A caller must not be able to choose the address for a key the workspace stored for another one.

## Examples

- Given a stored secret `openai-key` that the workspace's `openai` provider uses and `baseUrl` `https://attacker.example/v1`, then the turn answers 400 `model_address_not_allowed` and no request is made.
- Given the same secret and no `baseUrl`, with an `openai` provider file that has none either, then the turn is forwarded.
- Given the provider's secret with a different `type`, then the turn answers 400.
- Given settings without a `secret`, then the gate isn't asked.
