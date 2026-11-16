# @halonicjs/adapter-remote-gateway

The remote gateway of the desktop host: the one listener a tunnel may reach. It speaks only the remote gateway protocol (sessions, events, approvals, prompt input) over WebSocket, on 127.0.0.1, and nothing starts it by default. The host's bridge, model gateway, MCP servers and secrets stay off it: the gateway reaches the host only through a `GatewaySessionSource`.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-remote-gateway`

## Example

```ts
// Only when the person turns remote access on; the source is the host's own sessions and approvals.
const gateway = await startGatewayListener({ source, policy: { allowRiskyRemotely: () => false } });
// A tunnel forwards to 127.0.0.1:gateway.port and to nothing else.
await gateway.close();
```
