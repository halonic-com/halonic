# @halonicjs/target-node-harness

Wires the harness host on this computer: Claude Code and Codex in the fenced srt sandbox or the
launcher, the Node bridge servers, the provider keys and the run proposals' folders. The CLI's
engine opens it; Studio's background engine will too.

- **Layer:** targets
- **Owner:** owen
- **Public API:** `@halonicjs/target-node-harness`

## Example

```ts
import { openLocalHarnessHost } from "@halonicjs/target-node-harness";

// Under the workspace's engine lock.
const host = await openLocalHarnessHost({ halonicVersion, location, folders, profile, … });
await host.start();
// … run the engine …
await host.close();
```
