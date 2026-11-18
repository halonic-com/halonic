# workspace.provider-host

- Status: draft
- Since: unreleased
- Source: flow-models 4.2 (HAL-177), HAL-63 (B5), for the Prices and budget step (HAL-1292)

The workspace package shall give the host of a provider's address as text, in lower case: the key a remembered "No limit" is kept under. The address is the provider's `baseUrl`, or else the default of its type; an address that can't be read has no host.

## Examples

- Given `type: openai` with no `baseUrl`, or `https://API.OpenAI.com:443/v1`, when asked for its host, then it is `api.openai.com`.
- Given `http://192.168.1.20:1234/v1`, then the host is `192.168.1.20`.
- Given an unknown type with no `baseUrl`, or an address that isn't a URL, then there is no host.
