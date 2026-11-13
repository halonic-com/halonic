# ports.sandbox-setting-store

- Status: active
- Since: 0.1.0
- Source: [pluggable sandbox layer](../../../../docs/adr/2026-11-11-pluggable-sandbox-layer.md), "The setting"; HAL-3779 design section 2.3; HAL-5392

The ports package shall have a `SandboxSettingStore` port (version 1) that gets, saves and removes the person's sandbox choice for this computer and operating system user. A choice shall be either a backend from `sandboxBackendIds` with the time the person chose, or `backend: "none"` with that time and the app version. No record means the person hasn't chosen yet. The port shall only store the choice: it shall have no method that decides which sandbox runs. Every adapter shall pass the `contracts.sandbox-setting-store` suite.

The port's documentation shall state that the choice lives in the user's profile and never in a workspace, that a choice that can't be read makes `get` throw and never return `null`, and that `remove` still deletes it.

The ports package shall export `isSandboxSetting(value)`, which is true only for a value with exactly the fields of a choice, each text, and a backend that is listed or `"none"`. Adapters check what they read with it, and `SandboxChoiceService` checks what a store gives back with it.

## Examples

- Given the `SandboxSettingStore` port,
  when its methods are read,
  then they are exactly `get`, `save` and `remove`.
- Given a choice of `none` without `appVersion`,
  when it is compiled,
  then it doesn't compile.
- Given a choice of a backend that isn't in `sandboxBackendIds`,
  when `isSandboxSetting` checks it,
  then it is false.
- Given a value with every field of a choice and also `sandbox: false`,
  when `isSandboxSetting` checks it,
  then it is false.
