# harness-bridge.openai

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B4, decision 7); HAL-2076 (no provider web tools for harness agents in 0.1); HAL-3218

The Node bridge shall pass a `POST /v1/responses` request to `https://api.openai.com` only, under the rules of `harness-bridge.pass-through`, with the program's query, only the `accept`, `content-type` and `openai-beta` request headers, and the value of the agent's OpenAI key secret as a `Bearer` `authorization` in place of the program's own key; the program's `openai-organization` and `openai-project` stay behind. Of the reply's headers, only `content-type`, `x-request-id`, `retry-after`, `retry-after-ms`, `x-should-retry` and the `x-ratelimit-` headers go back. It shall remove every tool whose `type` starts with `web_search`, and every tool of type `mcp`, from the request's `tools`, whatever the tool's name, and send a request with nothing to remove unchanged. When the agent doesn't use OpenAI with a key, its key isn't set or holds anything but visible ASCII, or the body isn't JSON, the bridge shall refuse the request without calling OpenAI, and its error shall name the key's secret but never its value.

## Examples

- Given an agent with an OpenAI key,
  when Codex sends a streaming request with its own key and organization,
  then OpenAI gets the agent's key, no organization and the same bytes, and each event reaches Codex as it arrives.
- Given a request with a `web_search_preview` tool, an `mcp` tool and a function tool named `web_search`,
  when the bridge passes it on,
  then the two server tools are gone and the function tool is still there.
- Given an agent whose key secret holds a line break,
  when Codex sends a request,
  then it gets a 401 that names the secret and not its value, and OpenAI is never called.
- Given an agent that doesn't use OpenAI,
  when Codex sends a request,
  then it gets a 403 and OpenAI is never called.
