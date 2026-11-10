# Decision: `sandbox.opened` drops two folders, gains a reader and the group list; a `sandbox.off` event

- Approval: board approval of proposal 1 ("What this run can do") in the `proposals` document on [HAL-1601](/HAL/issues/HAL-1601); the facts for the sandbox screens on [HAL-1782](/HAL/issues/HAL-1782) and the UX checklist on [HAL-1833](/HAL/issues/HAL-1833); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1707

## What changes

- `SandboxOpenedView` loses `tempFolder` and `settingsFolder`, and `ShownSandboxProfile` no
  longer reads them. The `events.sandbox-opened` requirement no longer lists them and gains an
  example that neither path is logged. The type test that pins the view loses the two fields.
- `deniedPathGroupCodes` is the one list of the six groups of denied paths, and
  `DeniedPathGroup.code` and `SandboxOpenedView.deniedGroups` take only those codes. The
  requirement names the six. The test that used a made-up `cloud-keys` code now uses
  `cloud-sign-ins`, and the one that used `x` for an empty group now uses `browser-data`.
- `readSandboxOpened(value)` reads a stored view and never throws. The requirement gains two
  examples for it.
- The run log gains one event, `sandbox.off`, with `state`, `agent` and `chosenAt`, and its own
  requirement, `events.sandbox-off`. The `events.run-log-contract` example that lists the events
  added since the reference now names it, and the type test that pins the list gains it.

## Why

- **The two folders:** the UX checklist (HAL-1833, line 1.3) says the "Writes in" row ends with
  "and its own temporary folder" and never names a path, and the settings folder is shown as
  the "Your sign-in" row, not as a path. A path the screens never show has no reason to be in
  the log, and leaving it out is the safer reading of Julian's condition on HAL-1673. Logs with
  `sandbox.opened` have only been written since 9 Nov on development builds; nothing reads the
  two fields, and an older event that still has them reads fine, because `readSandboxOpened`
  copies only the listed fields.
- **The group list:** HAL-1782 (P4) fixed the six groups. One list means the profile builder,
  the log and the message catalogue keys can't drift apart.
- **The reader:** the run view must say it couldn't read what a step could do (UX checklist
  line 1.2) instead of failing or showing part of it.
- **`sandbox.off`:** HAL-1782 (P2). With it, a run page tells a sandboxed step, a step that ran
  without the sandbox and a step from an older log apart.

No test was weakened or removed: the two removed fields are now checked to be absent.

## Covers

- events.run-log-contract
- events.sandbox-opened
- events.sandbox-off
- packages/core/events/src/run-event.test.ts
- packages/core/events/src/run-event-fields.test.ts
- packages/core/events/src/sandbox-opened.test.ts
