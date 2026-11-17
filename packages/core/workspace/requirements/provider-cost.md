# workspace.provider-cost

- Status: active
- Since: unreleased
- Source: HAL-63 requirements (B3 and B4), for the Models budget block and the Prices and budget step (HAL-1292)

The workspace package shall say whether a model provider is on this machine, whether a model on it is also free, and whether a provider may bill per use. A provider's address is its `baseUrl`, or else the default of its type from the ports package (`ollama` and `lmstudio` call localhost, as the adapter does). A provider is on this machine, failing closed, only when its type is `mock` or the host of its address, read by `urlHost`, is `localhost`, in `127.0.0.0/8` or `::1`; an address that can't be read, and an unknown type with no `baseUrl`, are not this machine. `Provider.local` is ignored on purpose: this is decided by type and address, never by a setting. A model on this machine is free only when the provider has no secret and no auth-like header in `options.headers`, the model's name doesn't end in `cloud`, and the alias sets no price. A provider may bill per use unless it is `mock` or has none of these: a secret, an auth-like header, a query string in its `baseUrl`, or a public host of its address (not `10/8`, `172.16/12`, `192.168/16`, `fc00::/7`, `fe80::/10`, a single-label name or this machine); a host that can't be read, or an unknown type with no `baseUrl`, is public. Only the presence of a key is checked, never its value.

## Examples

- Given Ollama at `http://localhost:11434/v1` and `http://127.1:11434`, when asked, then both are on this machine; `http://localhost.evil.example` and `http://localhost@evil.example` are not.
- Given `type: ollama` or `type: lmstudio` with no `baseUrl`, and no key, when asked, then it is on this machine, free for a local model and not pay-per-use; `type: openai-compatible` with no `baseUrl` is neither.
- Given Ollama on this machine with no key and the model `llama3.2`, when asked, then it is free; with the model `gpt-oss:120b-cloud`, with a secret, or with a price set, then it is not.
- Given `https://api.anthropic.com/v1`, or a provider with only a secret and a LAN address, when asked, then it may bill per use.
- Given LM Studio at `http://192.168.1.20:1234/v1`, `http://nas:8000` or `http://[fd00::1]` with no key, when asked, then it does not.
- Given `http://localhost:11434?key=x`, or a header `X-Api-Key`, then it may bill per use, even on this machine.
