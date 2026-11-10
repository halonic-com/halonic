# @halonicjs/adapter-harness-bridge

The Halonic bridge for harness runs. Each run gets its own server on a free
port of `127.0.0.1`, which answers only requests that carry the run's token in
the `x-halonic-run-token` header. It passes the program's Anthropic model
requests (`POST /v1/messages`) on to `https://api.anthropic.com`, so keys,
integrations and approvals stay outside the sandbox. Serving Halonic's tools
over MCP and an OpenAI route come with later steps of the build plan; the
bridge doesn't serve them yet.

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

- **Token.** Any request without the run's exact token gets a 401, whatever its
  path. A path the bridge doesn't serve gets a 404.
- **Pass-through.** The bridge sends the request's bytes to the provider and
  copies the status, the allowed reply headers and the body back as they
  arrive, error replies included. Streams reach the program event by event.
  A provider that can't be reached or is too slow to start gets a 503 of kind
  `unavailable`.
- **Anthropic.** Only the `accept`, `anthropic-beta`, `anthropic-version` and
  `content-type` headers go on, with the agent's own key as `x-api-key` in
  place of the program's. The bridge removes `web_search_*` and `web_fetch_*`
  tools and `mcp_servers` from the request. A content block with a URL
  `source` is refused with kind `denied`. Error messages name a key's secret,
  never its value.
- **Closing.** `close()` refuses new requests, aborts the ones in flight and
  resolves once they have ended or the close time limit has passed. Closing
  twice is safe.

The rules are in `requirements/`: `server.md`, `pass-through.md` and
`anthropic.md`.

## Options

| Export                           | What it is                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `NodeHarnessBridgeServer`        | The `HarnessBridgeServer` port on Node's `http` server.                                     |
| `NodeHarnessBridgeServerOptions` | Its options: `secrets` (required), `limits`, `upstreamLimits`, `fetch`, `closeTimeoutMs`.   |
| `BodyLimits`                     | Request size (`maxBytes`) and arrival time (`timeoutMs`).                                   |
| `UpstreamLimits`                 | How long a provider may take to start (`responseTimeoutMs`) or go silent (`idleTimeoutMs`). |
| `Fetch`                          | The `fetch` the bridge calls providers with; tests give a fake one.                         |
| `defaultBridgeLimits`            | 32 MiB and 60 seconds.                                                                      |
| `defaultUpstreamLimits`          | 10 minutes to start a reply, 2 minutes of silence.                                          |
| `defaultCloseTimeoutMs`          | 5 seconds.                                                                                  |

Each limit you leave out keeps its default. `closeTimeoutMs` must be a whole
number of milliseconds, 0 or more.
