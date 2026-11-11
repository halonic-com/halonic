# @halonicjs/adapter-agent-host-client

The engine's `Sandbox`, bridge host and `Harness` as stand-ins that call the agent host (`apps/agent-host`), which runs the real ones. In Studio the engine runs in the page, which has no Node, so the sandbox, the bridge and the harnesses run in the host instead. Integrations, secrets and approvals stay in Studio.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-agent-host-client`

## The transport

The stand-ins call the host through an `AgentHostTransport`. It names a route from the host's table (`agentHostRequestRoutes`, `agentHostStreamRoutes`), never a URL. In Studio, the shell makes the calls, so the host's launch token never reaches the page. In tests, an in-memory host answers. A JSON route answers `{ status, body }`. A stream route answers its lines, each parsed from JSON, or the error the host gave instead of a stream. The host's errors become an `AgentHostError` with its status, `kind` and message.

## The sandbox

`AgentHostSandbox.connect(transport)` reads the host's capabilities once, because the port answers them without waiting. `check` and `open` call the host. An `AgentHostSession` has the host's id for it (`hostId`) and its fence proof. Its blocked accesses come from the host's stream and go to its listeners until it closes. It can't start a program itself: its programs start in the host, through a harness the host runs. Closing it twice closes it once, and a session the host already closed at its time limit counts as closed.

## The bridge

`AgentHostBridges` is the engine's bridge host. `open(agent, recorder)` opens the agent's bridge in the host, next to the sandbox whose program calls it, with the providers and prices Studio gives for that agent (`servicesFor`). The engine gets the bridge's url and token; `idOf(bridge)` gives the host's id for it, which a harness run names. The recorder, tools, approvals and keys stay in Studio: the host calls them over the bridge's stream, and the stand-in answers each call with `POST /v1/bridge/answer`, side by side, so a quick call doesn't wait behind an approval. A `cancel` aborts that call's signal. An answer over 1 MiB in UTF-8 isn't sent: the call gets an error instead, also when the host answers 413, so it never waits for an answer that can't arrive (HAL-4730). Closing asks the host to close the bridge and waits until it has recorded its last events.

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
