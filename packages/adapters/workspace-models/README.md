# @halonicjs/adapter-workspace-models

Turns a workspace's provider files into model providers, and picks the model of each model call from the workspace's aliases. The CLI's engine and the Studio's engine both use it, so a call goes to the same model in either.

- **Layer:** adapters
- **Owner:** elena
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-workspace-models`

## Example

```ts
import { workspaceModelResolver } from "@halonicjs/adapter-workspace-models";

const resolve = workspaceModelResolver({ workspace, secrets, http: { fetch } });
const model = await resolve({ hubId: "support", agentId: "writer", messages, tools: [] });
// { provider, model: "claude-opus-5-5", alias: "smart", secret: "anthropic-key", fallback: [] }
```
