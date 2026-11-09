# harness-bridge.anthropic

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B2, decision 7); HAL-2076 (no provider web tools for harness agents in 0.1)

The Node bridge shall pass a `POST /v1/messages` request to `https://api.anthropic.com` only, under the rules of `harness-bridge.pass-through`, with the program's query, only the `accept`, `anthropic-beta`, `anthropic-version` and `content-type` request headers, and the value of the agent's Anthropic key secret as `x-api-key` in place of the program's own key; of the reply's headers, only `content-type`, `request-id`, `retry-after`, `x-should-retry` and the `anthropic-ratelimit-` headers go back. It shall remove every tool whose `type` starts with `web_search_` or `web_fetch_` from the request's `tools`, whatever the tool's name, and send a request with nothing to remove unchanged. When the agent doesn't use Anthropic with a key, its key isn't set, or the body isn't JSON, the bridge shall refuse the request without calling Anthropic.

## Examples

- Given an agent with an Anthropic key,
  when Claude Code sends a streaming request with its own key,
  then Anthropic gets the agent's key and the same bytes, and each event reaches Claude Code as it arrives.
- Given a request with a `web_fetch_20250910` tool named `renamed_fetch` and an image block,
  when the bridge passes it on,
  then the tool is gone and the image block is still there.
- Given an agent that doesn't use Anthropic,
  when Claude Code sends a request,
  then it gets a 403 and Anthropic is never called.
