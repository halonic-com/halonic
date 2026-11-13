# @halonicjs/target-node-runtime

Runs the `host/server` handler on Node: an HTTP listener that is loopback-only by default, an opt-in
for the home network that needs a password, and a daily request count kept on disk.

- **Layer:** targets
- **Owner:** elena
- **Public API:** `@halonicjs/target-node-runtime`

## Example

```ts
import { listenOnNode, openDiskRequestCountStore } from "@halonicjs/target-node-runtime";

const requestCounts = openDiskRequestCountStore("profile/request-counts", clock);
const listening = await listenOnNode({
  createServer: (allowedHosts) => createServer({ config: { ...config, allowedHosts }, ports: { ...ports, requestCounts } }),
  port: 4310,
  network: true, // throws NetworkNeedsPasswordError unless passwordIsSet
  passwordIsSet: true,
  report: console.log, // Open on your phone: http://192.168.1.20:4310
  logError: console.error,
});
await listening.close();
```

The `serve` command that calls this comes in a later pull request.
