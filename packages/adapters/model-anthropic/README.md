# @halonicjs/adapter-model-anthropic

The model provider for Anthropic's Messages API: one call goes to `POST {baseUrl}/v1/messages` with native tools, on the built-in `fetch` and without Anthropic's SDK.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-model-anthropic`

## Example

```ts
import { AnthropicProvider } from "@halonicjs/adapter-model-anthropic";

// Gives the key for one call; read it from the workspace's secrets in real code.
const readKey = async () => "example-key"; // a made-up value; never put a real one in code

const model = new AnthropicProvider({ id: "claude", http: { fetch }, key: readKey });
const answer = await model.chat({
  model: "claude-sonnet-5-5",
  messages: [{ role: "user", content: "Hi" }],
});
```

`key` is a function that gives the key for one call; the key only goes into the `x-api-key` header. A failed call throws a `ModelCallError` whose reason says why: `key-refused` (401, and a 403 whose text names no country, region, territory, moderation, flagging, guardrail or model), `model-missing` (404), `out-of-credit` (402, a `billing_error`, the 429 for the tier's spend cap, or a message saying the credit balance is too low or the usage limit is reached), `provider-busy` (429, 5xx and the 529 of an overload), `offline`, which names the host that didn't answer, or `refused` for any other error. The message ends in the HTTP status. The API's own error text is not in it: it goes on the error's `cause`, and the run log keeps it as `providerText` for `--debug` and Copy details. It is dropped when the key is refused, when a 401 or 403 repeats a masked key such as `sk-proj-****abcd`, and when it holds the key. A reply over 10 MiB fails with `refused`.

Every call has its own time limits, whether or not the caller passes a signal. The reply must start within 10 minutes, and a reply that has started must send something at least every 2 minutes; the `limits` option (`responseTimeoutMs`, `idleTimeoutMs`) changes them. When a limit passes the call is closed and fails with `offline`, naming the host and the limit, so the turn can move on to its next model. A caller's own signal that aborts first still ends the call with the caller's reason.

The Messages API has no plain JSON mode, so the provider says `jsonOutput: false`. Settings only Anthropic knows, such as `thinking`, go in `params.extra`. `extra` adds settings and never replaces ours: `extra.tools` or `extra.system` is sent only when the request has no tools or system prompt of its own. Thinking comes back as `reasoning`, and its blocks as the replay that the next turn sends back.

## Streaming

`stream()` asks for server-sent events and gives `text`, `reasoning` and `tool-call` pieces as they arrive, then one `done` whose response equals what `chat()` gives for the same reply. Stopping early closes the call, and the reply has the same 10 MiB limit. A stream that fails after it started ends with a `ModelCallError` and no `done`. The API's `error` event gets the reason its status would: `overloaded_error` is `provider-busy`, as a 529 is, and a type it doesn't know is `refused`; its text goes on the `cause` under the same rules. A reply cut off before `message_stop`, data it can't read, or a block that doesn't start next in order (0, 1, 2 and on) is `refused`, and a dropped connection `offline`.

Cache token counts come back in the usage as `cacheReadTokens`, `cacheWriteTokens` (5-minute writes) and `cacheWrite1hTokens` (1-hour writes), apart from `inputTokens`, when there were any. Without the API's `cache_creation` split, every write counts as a 5-minute write.

The package is being built in small pull requests (HAL-2921). The factory follows.
