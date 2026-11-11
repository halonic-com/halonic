# @halonicjs/adapter-mcp

Our own MCP client, for servers over HTTP and programs on the person's computer.

- `src/protocol/` holds the MCP session: the `initialize` handshake, paged `tools/list` and
  `tools/call`, over any `McpTransport`.
- `src/http/` holds `McpHttpConnectorFactory`, the `ConnectorFactory` for `http` connectors. It
  talks MCP's streamable HTTP transport through the host's `HttpClient` (the context's `http`), so
  the host decides which addresses it may reach. It lists tools without a trust grant and calls
  none without one. A connector's `secret` goes only in the `Authorization` header. No request
  follows a redirect, each has a 60-second timeout and each message a 4 MiB limit
  (`defaultHttpLimits`). A dropped event stream fails its request and isn't resumed. A `secret`
  that isn't set refuses the call before any request, and the next call tries again. The session
  id the server gives is sent with every later message, and `close` ends the session with `DELETE`.
  When the server says it forgot the session (`404`), that call fails and the next one starts a
  new session (requirements `mcp.http-connector`, `mcp.http-transport`).
- `src/stdio/` holds `McpStdioConnectorFactory`, the `ConnectorFactory` for `stdio` connectors. It
  starts the program of a trusted workspace on the first call and talks MCP over its standard input
  and output. Before anything starts, the starter refuses a launch that reaches a skill's `scripts/`
  folder, and, when the factory's context gives `workingFolders` (the harness agents' working
  folders), one that would run or load a file from one of them; it checks the program it found on
  the `PATH` the same way, and reads only the connector file's own `env` as paths (requirements
  `mcp.program-starter`, `mcp.stdio-connector`).
- `src/pinned/` holds the pinned launcher for package runners (`npx`, `uvx` …) with a `pin`.
  It also holds `findRunner`, which finds a pinned connector's runner and its Node from the
  app's own environment (its `PATH`, on macOS the login shell's, then the usual install folders)
  and refuses a relative path. The login shell runs without `-i` and for 5 seconds at most, so a
  runner that only `.zshrc` puts on the `PATH` (nvm, fnm) may not be found; the refusal then asks for
  the runner's full path. The launcher starts the runner it finds.

## How a pinned package starts

A connector with a `pin` (from the trust record, never from the workspace) starts like this, and
any failed step refuses the start before a secret is read or a folder is created:

1. `checkPackageRunnerLaunch` from `@halonicjs/app` checks the command and the connector's `env`,
   counting the variables `secretEnv` sets. The refusal lists live there, not here.
2. Once the workspace is trusted, the pin's `registryUrl`, and only it, is asked which package and version it lists (npm's
   package document, PyPI's JSON API), with a 15-second limit. `checkResolvedVersion` refuses any
   other package or version.
3. `findRunner` finds the runner, and for npm its Node, in the app's own environment, never in the
   connector's `env`. On Windows npm's `npx.cmd` starts as `node.exe` with npm's `npx-cli.js`.
4. The runner it found starts with the pin's version added to its arguments (`pinnedRunnerArgs`),
   and the runner's and Node's folders first on `PATH`, in a new
   folder in the system's temporary folder. The folder holds only a `package.json` with `{}` in it, so npm
   doesn't look for a project above it (on Linux, `/tmp` is writable by anyone), and an empty npm
   config. `HOME`, the config, cache and temporary folder variables point at it, so no `.npmrc`,
   `uv.toml` or cache of the person's or the workspace's is read, and each launch downloads the
   package afresh.
5. Inherited package-manager and language variables are dropped and the registry is set from
   `registryUrl`. npm's user and global config point at the folder's empty config, uv and pip read
   no config file, and uv downloads no Python. An inherited proxy, certificate or preload stays:
   that's the person's machine.
6. The folder is deleted when the connector closes, and also when the start fails, so the next call
   plans a new launch with a new folder. A connector closed while its registry lookup runs creates
   no folder.

A package runner without a pin starts as configured, like any program the person trusted, in the
workspace folder (or its `cwd`), with the inherited environment, the connector's `env` and its
secrets. Both kinds start only once the workspace is trusted.

## How a program is started and stopped

- **Trust first.** Without a trust grant nothing starts and no secret is read.
- **No sandbox session.** This factory starts programs on this computer, so `create` throws for a
  context with `sandbox` set, before a secret is read or anything starts. A program that must run in a
  sandbox session needs a factory that starts it through that session (`ports.connector-sandbox-session`).
- **Secrets** go into the program's environment only, never into its arguments.
- **Limits** (`defaultStdioLimits`): every request, `initialize` included, has a 60-second timeout,
  and a message may be at most 4 MiB. Breaking either ends the session and stops the program.
  Standard error is read to its end; only its last 10 lines are kept, in memory, for the stopped
  report below.
- **A program that stops** fails the call that was waiting on it, which is not sent again: the
  tool may already have done its work. The next call starts the program again, through the same
  trust, pin and runner checks and in a new folder. After 3 restarts within 10 minutes
  (`defaultRestartLimits`) the connector stays stopped and throws `ConnectorStoppedError`, with the
  program's last error output in `errorOutput`, its secrets, key-shaped lines, e-mail addresses,
  home folder and user name removed. Its secrets include what it inherited from the app's
  environment: the value of each variable named like a secret (`API_KEY`, `NODE_AUTH_TOKEN`) and
  the password in a URL value, and the user name of an `http(s)` URL with no password when it is at least 16
  characters long, as in a Sentry DSN (`https://<key>@host/1`), whatever their shape
  (`mcp.stdio-inherited-secrets`). Shorter user names such as `x-access-token` and other schemes stay.
- **Stopping** closes the program's input, waits 2 seconds, sends SIGTERM to its process group,
  waits again, then SIGKILL. On Windows, `taskkill /T` ends the process tree.
- **Process starts** happen in one file, `src/stdio/node-program-starter.ts`, listed in
  `tooling/check/process-starters.json`. Everything else talks to the `ProgramStarter` seam, so the
  connector's tests use an in-process fake program.
- **Where `findRunner` looks on Windows**, after the app's `PATH`: Node's folder under
  `%ProgramFiles%`, npm's under `%APPDATA%`, Volta's `Volta\bin` under `%LOCALAPPDATA%`, then
  Scoop's `scoop\shims`, `.local\bin` and `.cargo\bin` under the home folder. Variable names are
  read in any letter case. Scoop's shims are `.exe` files, so they start directly.

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
tool of an `http` or `stdio` connector as `write` unless a trusted workspace sets a lower risk.

## Example

```ts
import {
  createRunnerSearch,
  McpStdioConnectorFactory,
  nodeLaunchFolders,
  nodeProgramStarter,
} from "@halonicjs/adapter-mcp";

const factory = new McpStdioConnectorFactory({
  starter: nodeProgramStarter,
  folders: nodeLaunchFolders,
  runners: createRunnerSearch(process.env),
  inheritedEnv: process.env,
  clientInfo: { name: "halonic", version: "0.1.0" },
});
const notes = factory.create(config, context);
const tools = await notes.listTools();
const answer = await notes.callTool("search_notes", { query: "invoices" });
await notes.close();
```

`folders` makes and deletes the launch folders of pinned programs (`nodeLaunchFolders` puts them in
the system's temporary folder). `inheritedEnv` is every variable a started program gets besides its own `env` and secrets. The
example passes the app's whole `process.env`, which suits a program the person trusted directly.
The connector doesn't trim it: the composition root decides what goes in. Create `runners` once
for the app's lifetime, so the login shell is asked for its `PATH` once per start.
