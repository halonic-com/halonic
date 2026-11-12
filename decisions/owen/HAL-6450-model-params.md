# Decision: a resolved model carries its alias's params

- Approval: Liam decided this on HAL-6444 (fix task HAL-6450, after the findings of HAL-6432, part 1); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wI/d2lRl0Tci7tU9YO1mjKy8kkc07jJuGfba93vZzCuN2jOkcB4bmwQqE2qh56ZgS2cSrqXxsOxfu8Z8e953Bg==
- Task: HAL-6450

## What changes

`cli.workspace-models` listed what the CLI gives a resolved model: its provider, alias, secret name,
price, whether it runs on this computer and its fallbacks. It now also gives the alias's `params`,
left out when the alias sets none, and each fallback gets its own alias's `params`. One example is
added for that. No example was removed or weakened.

## Why

An alias's `params` in `models.yaml` were read and checked, then dropped: the model never got them.
The engine now lays the agent's `params` over the alias's for every model call, and a chat turn's
request `params` over both (new requirement `engine.model-params`). For that the engine needs each
model's own alias params, which only the CLI's resolver reads from the workspace.

## Covers

- cli.workspace-models
- apps/cli/src/workspace-model-resolver.test.ts
