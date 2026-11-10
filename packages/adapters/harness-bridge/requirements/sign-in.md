# harness-bridge.sign-in

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B5, decision 4; harness checks, check 1); HAL-2115 (a sign-in call costs 0); HAL-3589; `HarnessBridgeServer` port v1

When an agent signs in to Anthropic or OpenAI with a subscription, the Node bridge shall pass the program's own `authorization` header to that provider's one fixed host, `https://api.anthropic.com` or `https://api.openai.com`, exactly as the program sent it, under the rules of `harness-bridge.anthropic` or `harness-bridge.openai` for the path, the other headers and the body. It shall add no header of its own that signs the call in, shall not read a secret or a price for it, and shall record the call's tokens with `cost: 0` and `paidBy: "subscription"`. The sign-in shall never appear in an event, an error reply of the bridge, or a log. The bridge shall take the run token only from the `x-halonic-run-token` header and never from `authorization`, and shall never send that header on. When the program sends no `authorization`, or one with anything but visible ASCII and spaces, the bridge shall refuse the request with the kind `unauthenticated` without calling the provider, and its error shall name the header but never its value. The provider's own reply to the sign-in, a refusal included, goes back unchanged.

## Examples

- Given an agent that signs in to Anthropic,
  when Claude Code sends a request with its sign-in in `authorization` and a key of its own in `x-api-key`,
  then `api.anthropic.com` gets the same `authorization`, no `x-api-key`, and the same bytes.
- Given an agent that signs in to OpenAI,
  when Codex sends a request with its sign-in,
  then `api.openai.com` gets the same `authorization`, and the bridge records the call's tokens with a cost of 0, paid by the subscription.
- Given a request the bridge refuses itself, such as one with an image at a URL,
  when it carries a sign-in,
  then the bridge's error, its events and its logs don't contain the sign-in.
- Given a request with the run token in `authorization` and another token in `x-halonic-run-token`,
  when it reaches the bridge,
  then it gets a 401 and the provider is never called.
- Given an agent that signs in,
  when the program sends no `authorization`,
  then it gets a 401 that names the header, and the provider is never called.
