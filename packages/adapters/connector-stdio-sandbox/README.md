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
  limit, as on this computer. Its error output is read and dropped, never kept: the profile gave
  it secrets.
- **Halonic builds the profile, never the plugin.** `localToolLaunch` builds the session's profile
  (working folder, environment, network, time limit) and the command from the place the host set
  up, the stdio config, the pin and the secrets. The host opens the session with it. Before each
  start the connector runs the pin check, reads the secrets, builds it again and refuses a session
  whose profile differs, naming the fields, never a value.

## What it exports

- `SandboxStdioConnectorFactory`: the `ConnectorFactory` for the `stdio` transport. `create(config,
  context)` throws for another transport or a context without `sandbox`, and otherwise returns a
  `ConnectorClient` that starts its program on the first call, through `context.sandbox` only.
- `SandboxStdioOptions`: `clientInfo`, `localTools` (what the host set up for each connector id,
  as a `LocalToolSetup`; a connector it didn't set up doesn't start) and `onBlocked`, and
  optionally `limits`, `restartLimits` and `clock`.
- `LocalToolSetup`: what the host set up for one local tool, its `place`.
- `ConnectorBlock`: what `onBlocked` hears, `{ connectorId, block }`.
- `localToolLaunch(stdio, place, pin, secretEnv)`: builds the `LocalToolLaunch` (`profile` and
  `command`) the host opens the session with, and the connector rebuilds to check it. With the
  types it takes and returns: `StdioConfig`, `LocalToolPlace` (where the tool runs) and
  `PinnedRunner` (the runner found for a pinned package, and its platform). A pinned package
  starts as the pinned launcher starts it on this computer, and its registry's host joins the
  sites.
- `readSecretEnv(connectorId, secretEnv, secrets)`: a connector's secret values by variable name,
  for the host to build the profile; it throws naming the first secret that isn't set.
- `SandboxNotFencedError` (with its `reason`) and `SandboxSessionEndedError`: the two typed
  refusals the host checks for.
- `sandboxProgram(process)`: a session's `SandboxProcess` as the MCP stdio transport's
  `RunningProgram`. `terminate` and `kill` both call the sandbox's one `kill`.

Requirements: `session-start`, `session-ended`, `blocked-events` and `local-tool-profile`.

## Example

```ts
import { SandboxStdioConnectorFactory } from "@halonicjs/adapter-connector-stdio-sandbox";

const factory = new SandboxStdioConnectorFactory({
  clientInfo: { name: "halonic", version: "0.1.0" },
  localTools: (connectorId) => setUpLocalTools.get(connectorId),
  onBlocked: ({ connectorId, block }) =>
    events.push({ type: "sandbox.blocked", connectorId, block }),
});
const client = factory.create(config, { ...context, sandbox: session });
const tools = await client.listTools();
```
