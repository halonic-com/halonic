# @halonicjs/adapter-mcp

Our own MCP client for programs on the person's computer. `src/protocol/` holds the MCP session:
the `initialize` handshake, paged `tools/list` and `tools/call`, over any `McpTransport`. The stdio
connector that starts a trusted local program comes next (HAL-230).

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-mcp`

## Where the protocol code comes from

`src/protocol/` is ported from `integrations/mcp` in `halonic-com/integrations` (commit `ab84889`),
so Halonic has one MCP protocol, not two. **This copy is the source.** Changes to the protocol land
here first. Once the integration kit publishes it, `integrations/mcp` imports it and deletes its
own copy.

Two things differ from the original, because of this repo's rules:

- schemas are built with `@halonicjs/schema-kit`'s `s` instead of Zod directly;
- `AbortSignalLike` is defined in `transport.ts` instead of coming from
  `@halonicjs/integration-shared`.

`src/protocol/` must stay free of `node:` imports and of transport code, so an integration can use
it unchanged. A test checks the imports.

## Example

```ts
import { McpSession } from "@halonicjs/adapter-mcp";

const session = new McpSession(transport, { clientInfo: { name: "halonic", version: "0.1.0" } });
await session.initialize();
const tools = await session.listTools();
const answer = await session.callTool("search_notes", { query: "invoices" });
```
