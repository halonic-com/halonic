# Decision: host settings remove over the size limit, watch before load, reset

- Approval: decided on [HAL-6743](/HAL/issues/HAL-6743) (Liam's review follow-ups from HAL-6216), a technical team decision with no board card; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hnFUw62YYa/hC1G+qz3FVC/03hn1hCc6sZWsU39d0XLes1smDl6gzqEBHoqC50Hr+r00wa+OWaHNZ3u3mWWnCg==
- Task: HAL-6743

## What changes

`ports.host-settings-store`: `changeSavedHostSettings` checks `hostSettingsMaxBytes` only when a
value is saved. A removal is never refused for size, so settings already over the limit can be
brought back under it. A save that would bring the values over the limit is still refused.

`contracts.host-settings-store`: over saved settings already over the size limit, an adapter
still refuses a save but removes a key.

`app.host-settings`: `load` starts the watch before the first read, so a change made during the
load is read once after it, and stops it again when that first load fails. `HostSettings.reset`
puts a setting back to its fallback by removing its saved value: it takes its turn with saves,
and when the store's removal fails it throws and keeps the value from before.

No example was removed or weakened; only examples were added. The golden file
`packages/testing/contracts/src/golden/host-settings-limits.json` doesn't change.

## Why

Settings saved over the limit (by a newer Halonic, or a file edited by hand) left no setting
that could be removed or changed, so Settings was stuck. A change made between the first read
and the start of the watch was missed until the next change. Studio needs to put a setting back
to its default without saving the fallback as a value. The desktop shell's Rust side (7d,
HAL-6261) follows the same removal rule.

## Covers

- app.host-settings
- ports.host-settings-store
- contracts.host-settings-store
