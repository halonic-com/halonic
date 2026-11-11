# format.workspace-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a `workspace.yaml`, the format shall accept the keys, value rules and defaults of the old `WorkspaceSettings` schema, unchanged: `privacy.localOnly` false, `defaults` `inprocess` and `default`, budget currency `EUR`, at most 64 assistant steps.

## Examples

- Given `id: acme` and `name: Acme`, when it is parsed, then the value has version 1, `privacy: { localOnly: false }` and `defaults: { runtime: inprocess, model: default }`.
- Given `budget: { perRun: 2 }`, when it is parsed, then the budget is `{ currency: EUR, perRun: 2 }`.
- Given `id: Acme`, when it is parsed, then it fails with `invalid_format` at `id`, line 1.
- Given `assistant: { maxSteps: 65 }`, when it is parsed, then it fails with `too_big` at `assistant.maxSteps`.
