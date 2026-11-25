# app.deploy-reaches

- Status: active
- Since: unreleased
- Source: HAL-18016; deploy flow revision 5 on HAL-6687 (2.7 "Reaches", 3.6 "Something can't run on Cloudflare"), approved by the board on HAL-6814 with choice C1 and Julian's conditions from HAL-6716

When `halonic deploy` works out what a deployment on Cloudflare would reach, the deploy app service shall read it from the workspace's files: each model provider but the test model, at its `baseUrl` or, without one, at its type's own address (`api.anthropic.com`, `api.openai.com`), and each `http` connector at its URL, each with the secret it names, by name only, every address and secret pair once. A secret shall be paired only with the address of the provider or connector that names it, because only that one is sent it. The list shall be complete or there shall be none: if any provider, connector or agent can't be placed on an internet address (a connector that starts a program or runs on this computer, an agent that starts a harness, a provider or connector at `localhost`, on a private network or marked `local`, or a provider whose address can't be worked out), it shall give every such file with one sentence on why and whether it needs an internet address or only runs on this computer, and no list, so the deploy stops instead of showing part of what it reaches.

## Examples

- Given a provider `claude` of type `anthropic` with the secret `anthropic-key`, and an `http` connector `crm` at `https://api.crm.example/mcp` with the secret `crm-key`,
  when its reaches are read,
  then they are `api.anthropic.com` with `anthropic-key` and `api.crm.example` with `crm-key`.
- Given only the test model,
  when its reaches are read,
  then the list is empty.
- Given a connector `files` that starts a program and a provider `ollama` of type `ollama`,
  when its reaches are read,
  then there is no list, and the problems are "The connector files starts a program, and Cloudflare can't start programs." and "The provider ollama is at localhost, which Cloudflare can't reach.".
- Given a provider of type `openai-compatible` with no `baseUrl`,
  when its reaches are read,
  then there is no list, and the problem is "The provider gw gives no address, so Halonic can't tell where it sends requests.".
