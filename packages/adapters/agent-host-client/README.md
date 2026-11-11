# @halonicjs/adapter-agent-host-client

The engine's `Sandbox` and `Harness` as stand-ins that call the agent host (`apps/agent-host`), which runs the real ones. In Studio the engine runs in the page, which has no Node, so the sandbox, the bridge and the harnesses run in the host instead. Integrations, secrets and approvals stay in Studio.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-agent-host-client`

## The transport

The stand-ins call the host through an `AgentHostTransport`. It names a route from the host's table (`agentHostRequestRoutes`, `agentHostStreamRoutes`), never a URL. In Studio, the shell makes the calls, so the host's launch token never reaches the page. In tests, an in-memory host answers. A JSON route answers `{ status, body }`. A stream route answers its lines, each parsed from JSON, or the error the host gave instead of a stream. The host's errors become an `AgentHostError` with its status, `kind` and message.

## The sandbox

`AgentHostSandbox.connect(transport)` reads the host's capabilities once, because the port answers them without waiting. `check` and `open` call the host. An `AgentHostSession` has the host's id for it (`hostId`) and its fence proof. Its blocked accesses come from the host's stream and go to its listeners until it closes. It can't start a program itself: its programs start in the host, through a harness the host runs. Closing it twice closes it once, and a session the host already closed at its time limit counts as closed.

## The harnesses

`agentHostHarnesses(transport, { bridgeIdOf, environments })` gives one `AgentHostHarness` per harness the host lists. `environment` is the harness's own function (`claudeCodeEnvironment`, `codexEnvironment`), called here, because it only reads its arguments. A run needs a session open in the host and a bridge opened there, and names both by their ids, so the bridge's token never travels again. The run reads the host's stream from the start, so `send` and `cancel` work before anyone reads its events. `cancel` resolves once the stream has ended.

## Example

```ts
const sandbox = await AgentHostSandbox.connect(transport);
const session = await sandbox.open(profile);
session.onBlocked((block) => report(block));
const harnesses = await agentHostHarnesses(transport, {
  bridgeIdOf: (bridge) => bridges.idOf(bridge),
  environments: { "claude-code": claudeCodeEnvironment, codex: codexEnvironment },
});
```
