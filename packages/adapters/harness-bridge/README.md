# @halonicjs/adapter-harness-bridge

The Halonic bridge for harness runs. Each run gets its own server on a free
port of `127.0.0.1`, which answers only requests that carry the run's token in
the `x-halonic-run-token` header. It passes the program's model
requests on to the provider's one fixed host: Anthropic's (`POST
/v1/messages`) to `https://api.anthropic.com` and OpenAI's (`POST
/v1/responses`) to `https://api.openai.com`, so keys, integrations and
approvals stay outside the sandbox. It also serves Halonic's tools for the
run's agent over MCP at `/mcp`.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-bridge`

## Example

```ts
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";

const server = new NodeHarnessBridgeServer({ secrets });
const bridge = await server.open({ runId, agentId, providers, price, recorder, tools, approvals });
try {
  // Give the program bridge.url and bridge.token, then run it.
} finally {
  await bridge.close();
}
```

`secrets` is the `Secrets` port the bridge reads the agent's provider key from.

## What the bridge does

- **Host and origin.** A request whose `Host` isn't `127.0.0.1` or `localhost`
  with the bridge's port gets a 421, so a web page that points its own domain
  at 127.0.0.1 gets nothing. A request with an `Origin` header comes from a
  web page and gets a 403. Both are checked before the token, whatever the
  path.
- **Token.** Any request without the run's exact token gets a 401, whatever its
  path. A path the bridge doesn't serve gets a 404.
- **Pass-through.** The bridge sends the request's bytes to the provider,
  without following a redirect, so the key only goes to the route's address, and
  copies the status, the allowed reply headers and the body back as they
  arrive, error replies included. Streams reach the program event by event.
  A provider that can't be reached, answers with a redirect or is too slow to
  start gets a 503 of kind `unavailable`.
- **Anthropic.** Only the `accept`, `anthropic-beta`, `anthropic-version` and
  `content-type` headers go on, with the agent's own key as `x-api-key` in
  place of the program's. The bridge removes `web_search_*` and `web_fetch_*`
  tools and `mcp_servers` from the request. A content block with a URL
  `source` is refused with kind `denied`. Error messages name a key's secret,
  never its value.
- **OpenAI.** Only the `accept`, `content-type` and `openai-beta` headers go
  on, with the agent's own key as `Authorization: Bearer`; the program's key,
  organization and project stay behind. The bridge removes the `web_search*`
  and `mcp` tools from the request. An image or file that OpenAI would fetch
  from a URL, and a stored prompt, are refused with kind `denied`. Of the
  reply headers only the body's type, the request id, the retry hints and
  `x-ratelimit-*` reach the program.
- **Forced tools.** Once the removed tools are gone, a `tool_choice` that
  forces one of them, or forces some tool when none is left, becomes `auto`,
  so the provider doesn't refuse a request over a tool the program can't use.
  A choice that lists several tools (`allowed_tools` at OpenAI) loses the
  removed ones, and becomes `auto` when none are left. This holds for both
  providers.
- **Subscription sign-in.** For an agent that signs in with a subscription,
  the program's own `authorization` goes on to the provider unchanged, in
  place of a key. The bridge adds nothing, never logs or keeps the sign-in,
  and records the call's tokens at a cost of 0, paid by the subscription.
  The run token is read only from `x-halonic-run-token`, never from
  `authorization`.
- **MCP.** `POST /mcp` speaks MCP's streamable HTTP transport, one JSON-RPC
  message per request with one JSON reply: `initialize`, `ping`, `tools/list`
  and `tools/call`, backed by the run's `BridgeTools`. Each call is checked
  first, by the same rules as the built-in loop; a refused call doesn't run
  and the program reads `Refused: <reason>`. A call that runs is recorded as
  `tool.called` and `tool.result`; one that broke off without an answer is
  recorded with outcome `unknown`. A call that needs a person's OK is asked
  through the run's `approvals` first and runs only once approved; a call a
  person rejected, or one whose question ended without an answer, doesn't run
  and isn't recorded. `GET /mcp` gets a 405: the bridge sends no messages of
  its own.
- **Permission prompt.** `POST /mcp/permission-prompt` is a second MCP server
  with the one tool `approve_permission`, which Claude Code calls through
  `--permission-prompt-tool` before one of its own tool calls that its settings
  don't already allow. The bridge asks a person through the run's `approvals`
  and answers in Claude Code's format, `allow` with the input unchanged or
  `deny` with the reason. It records nothing, because Claude Code reports its
  own calls, and a program never finds the tool among Halonic's at `/mcp`.
- **Closing.** `close()` refuses new requests, aborts the ones in flight and
  resolves once they have ended or the close time limit has passed. Closing
  twice is safe.

The rules are in `requirements/`: `server.md`, `pass-through.md`,
`anthropic.md`, `openai.md`, `sign-in.md`, `spend.md`, `mcp.md` and `approvals.md`.

## Options

| Export | What it is |
| --- | --- |
| `NodeHarnessBridgeServer` | The `HarnessBridgeServer` port on Node's `http` server. |
| `NodeHarnessBridgeServerOptions` | Its options: `secrets` (required), `limits`, `upstreamLimits`, `fetch`, `closeTimeoutMs`. |
| `BodyLimits` | Request size (`maxBytes`) and arrival time (`timeoutMs`). |
| `UpstreamLimits` | How long a provider may take to start (`responseTimeoutMs`) or go silent (`idleTimeoutMs`). |
| `Fetch` | The `fetch` the bridge calls providers with; tests give a fake one. |
| `defaultBridgeLimits` | 32 MiB and 60 seconds. |
| `defaultUpstreamLimits` | 10 minutes to start a reply, 2 minutes of silence. |
| `defaultCloseTimeoutMs` | 5 seconds. |

Each limit you leave out keeps its default. `closeTimeoutMs` must be a whole
number of milliseconds, 0 or more.
