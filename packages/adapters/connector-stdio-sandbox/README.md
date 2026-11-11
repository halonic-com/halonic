# @halonicjs/adapter-connector-stdio-sandbox

The `stdio` connector for a plugin's local tool: it starts the tool's MCP program inside the
`SandboxSession` Halonic opened for it, and never on this computer directly. It speaks MCP with
`@halonicjs/adapter-mcp`'s session and stdio transport, so the protocol lives in one place.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-connector-stdio-sandbox`

## The rules it keeps

- **No session, no connector.** `create` refuses a context without `sandbox`.
- **No trust grant, or no proven fence, no start.** While the session's fence proof isn't
  `fenced`, the connector throws `SandboxNotFencedError` and starts nothing, in the session or on
  this computer. A person's yes to run without the sandbox doesn't cover programs.
- **Blocked accesses are reported.** Each access the sandbox refused reaches `onBlocked`, with
  the connector's id, for the host's `sandbox.blocked` event.
- **A session that ended ends the connector.** Every call then throws `SandboxSessionEndedError`.
  The host closes that session and opens a new session and connector for the next call. The
  connector never closes the session itself.
- **A program that stops starts again** on the next call, in the same session, up to the restart
  limit, as on this computer. Its error output isn't kept: the profile gave it secrets.

Halonic builds the session's profile (working folder, environment, network, time limit) itself,
never the plugin. Until that lands, a config with a `pin` or a `cwd` is refused (HAL-1738).

## Example

```ts
import { SandboxStdioConnectorFactory } from "@halonicjs/adapter-connector-stdio-sandbox";

const factory = new SandboxStdioConnectorFactory({
  clientInfo: { name: "halonic", version: "0.1.0" },
  onBlocked: ({ connectorId, block }) =>
    events.push({ type: "sandbox.blocked", connectorId, block }),
});
const client = factory.create(config, { ...context, sandbox: session });
const tools = await client.listTools();
```
