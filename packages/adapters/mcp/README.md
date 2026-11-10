# @halonicjs/adapter-mcp

Our own MCP client for programs on the person's computer.

- `src/protocol/` holds the MCP session: the `initialize` handshake, paged `tools/list` and
  `tools/call`, over any `McpTransport`.
- `src/stdio/` holds `McpStdioConnectorFactory`, the `ConnectorFactory` for `stdio` connectors. It
  starts the program of a trusted workspace on the first call and talks MCP over its standard input
  and output. Package runners (`npx`, `uvx` …) start through the pinned launcher, which comes next
  (HAL-2544); until then they are refused.
- `src/pinned/` holds `findRunner`, which finds a pinned connector's runner and its Node from the
  app's own environment (its `PATH`, on macOS the login shell's, then the usual install folders)
  and refuses a relative path. The login shell runs without `-i` and for 5 seconds at most, so a
  runner that only `.zshrc` puts on the `PATH` (nvm, fnm) may not be found; the refusal then asks for
  the runner's full path. It isn't wired into the launcher yet.

## How a program is started and stopped

- **Trust first.** Without a trust grant nothing starts and no secret is read.
- **Secrets** go into the program's environment only, never into its arguments.
- **Limits** (`defaultStdioLimits`): every request, `initialize` included, has a 60-second timeout,
  and a message may be at most 4 MiB. Breaking either ends the session and stops the program.
  Standard error is drained and dropped.
- **Stopping** closes the program's input, waits 2 seconds, sends SIGTERM to its process group,
  waits again, then SIGKILL. On Windows, `taskkill /T` ends the process tree.
- **Process starts** happen in one file, `src/stdio/node-program-starter.ts`, listed in
  `tooling/check/process-starters.json`. Everything else talks to the `ProgramStarter` seam, so the
  connector's tests use an in-process fake program.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-mcp`, and `@halonicjs/adapter-mcp/protocol` for the protocol alone

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
it unchanged. A test checks the imports, including that a relative import stays inside the folder.
Integrations import `@halonicjs/adapter-mcp/protocol`, never the root entry, which also holds the
stdio launcher. When the integration kit publishes the protocol, it moves to its own package;
with these rules that only moves files and changes this one entry.

## Tool risk in `_meta`

MCP has no field for what a tool can do, so a server may write it in the tool's `_meta`:
`"com.halonic/risk": "read" | "write" | "send"` and `"com.halonic/untrusted": true`. The connector
passes them on as the server wrote them. They are only the server's claim: the host treats every
tool of a `stdio` connector as `write` unless the workspace sets a lower risk.

## Example

```ts
import { McpStdioConnectorFactory, nodeProgramStarter } from "@halonicjs/adapter-mcp";

const factory = new McpStdioConnectorFactory({
  starter: nodeProgramStarter,
  inheritedEnv: process.env,
  clientInfo: { name: "halonic", version: "0.1.0" },
});
const notes = factory.create(config, context);
const tools = await notes.listTools();
const answer = await notes.callTool("search_notes", { query: "invoices" });
await notes.close();
```

`inheritedEnv` is every variable a started program gets besides its own `env` and secrets. The
example passes the app's whole `process.env`, which suits a program the person trusted directly.
The connector doesn't trim it: the composition root decides what goes in.
