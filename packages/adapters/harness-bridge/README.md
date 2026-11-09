# @halonicjs/adapter-harness-bridge

The Halonic bridge for harness runs. Each run gets its own server on a free
port of `127.0.0.1`, which answers only requests that carry the run's token in
the `x-halonic-run-token` header. It passes the program's model requests on to
the provider and serves Halonic's tools over MCP, so keys, integrations and
approvals stay outside the sandbox.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-bridge`

## Example

```ts
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";

const server = new NodeHarnessBridgeServer();
const bridge = await server.open({ runId, agentId, providers, price, recorder, tools, approvals });
try {
  // Give the program bridge.url and bridge.token, then run it.
} finally {
  await bridge.close();
}
```
