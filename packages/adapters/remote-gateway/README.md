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

## The end-to-end session

`SecureSession` is the host's end of the session in the ADR "Pairing and the end-to-end session": a Noise handshake (XXpsk3 to pair, IK to reconnect) in binary frames, then every gateway message inside a Noise transport message, through `@halonicjs/adapter-e2e-noise`. The only cleartext the host ever sends is `handshake-failed` or `pair-refused`, and it closes after either. The rules about codes, tries and Allow are the pairing service's, behind `GatewayPairing`; the host key and the paired phones are behind `GatewayPhones`.
