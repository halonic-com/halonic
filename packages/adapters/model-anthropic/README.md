# @halonicjs/adapter-model-anthropic

The model provider for Anthropic's Messages API: one call goes to `POST {baseUrl}/v1/messages` with native tools, on the built-in `fetch` and without Anthropic's SDK.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-model-anthropic`

## Example

```ts
import { AnthropicProvider } from "@halonicjs/adapter-model-anthropic";

const model = new AnthropicProvider({ id: "claude", http: { fetch }, key: readKey });
const answer = await model.chat({
  model: "claude-sonnet-5-5",
  messages: [{ role: "user", content: "Hi" }],
});
```

`key` is a function that gives the key for one call; the key only goes into the `x-api-key` header. A failed call throws a `ModelCallError` whose reason says why: `key-refused` (401, and a 403 whose text names no country, region, territory, moderation, flagging, guardrail or model), `model-missing` (404), `out-of-credit` (402, a `billing_error`, the 429 for the tier's spend cap, or a message saying the credit balance is too low or the usage limit is reached), `provider-busy` (429, 5xx and the 529 of an overload), `offline`, which names the host that didn't answer, or `refused` for any other error. The message ends in the HTTP status. The API's own error text is not in it: it goes on the error's `cause`, for `--debug` and Copy details once the run log keeps it ([HAL-3119](/HAL/issues/HAL-3119)), never after 401 or 403 and never when it holds the key. A reply over 10 MiB fails with `refused`.

The Messages API has no plain JSON mode, so the provider says `jsonOutput: false`. Settings only Anthropic knows, such as `thinking`, go in `params.extra`. Thinking comes back as `reasoning`, and its blocks as the replay that the next turn sends back.

The package is being built in small pull requests (HAL-2921). Streaming and the factory follow.
