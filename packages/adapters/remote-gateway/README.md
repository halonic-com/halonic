# @halonicjs/adapter-remote-gateway

The remote gateway of the desktop host: the one listener a tunnel may reach. It speaks only the remote gateway protocol (sessions, events, approvals, prompt input) and is off by default. This first part reads a phone's frames; the connection and the listener follow.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-remote-gateway`

## Example

```ts
const result = parseGatewayClientMessage({ binary: false, bytes });
if (!result.ok) closeWith(result.code); // "malformed" or "too-large"
```
