# @halonicjs/adapter-tunnel-tailscale

The Tailscale tunnel provider. It makes the remote gateway reachable from a phone on the person's own
tailnet with `tailscale serve`, over HTTPS, and never with Funnel, so the gateway is never public
(requirement `tunnel-tailscale.provider`). It never signs in; it only reports `signed-out`.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-tunnel-tailscale`

It refuses a serve port that already has an entry or Funnel, and on `stop` removes only the entry it
added itself. Every `tailscale` call runs with no shell, a small environment and a time limit.

## Example

```ts
import { nodeTailscaleRunner, TailscaleTunnel } from "@halonicjs/adapter-tunnel-tailscale";

const tunnel = new TailscaleTunnel({ runner: nodeTailscaleRunner() });
const endpoint = await tunnel.start({ gateway: { host: "127.0.0.1", port: 4100 } });
// endpoint.url is wss://<node>.<tailnet>.ts.net:8443
```
