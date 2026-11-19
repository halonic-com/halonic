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

## A harness agent's provider

A Claude Code or Codex agent whose file's `model` is an alias gets that alias's provider through the run's bridge, with its key (HAL-12488). `harnessModelAccess` gives the host the bridge route the provider speaks (`anthropic` for `type: anthropic`, `openai` for `type: openai` and `openai-compatible`), the provider file's id, secret name and `baseUrl`, the model id and the price. The route must be the one the agent's harness calls (Claude Code `anthropic`, Codex `openai`), else it fails with `not-for-harness`. It runs the same key check as `workspaceModelResolver` first, so a key goes to the same places from either. `harnessProviderModel` gives the model id alone, for the engine's `HarnessModelNames`. A name that is no alias gives `undefined`, and the program signs in itself.

```ts
import { harnessModelAccess } from "@halonicjs/adapter-workspace-models";

const access = await harnessModelAccess(workspace, "support", "open-coder-agent", "claude-code", {
  isTrusted,
  keyOrigins,
});
// { route: "anthropic", providerId: "zai", secret: "zai-key", baseUrl: "https://api.z.ai/api/anthropic", model: "glm-5.3" }
```
