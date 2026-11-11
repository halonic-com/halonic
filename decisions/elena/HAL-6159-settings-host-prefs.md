# Decision: golden cases for the host settings' limits and saved shape

- Requirement: `ports.host-settings-store` (`packages/core/ports/requirements/host-settings-store.md`)
- Task: HAL-6159 (PR 7a of the settings host API), with the review changes from HAL-6216
- Approval: Liam asked for this golden file in his design review on [HAL-6216](/HAL/issues/HAL-6216) and approves this note in review
- Kind: internal

`src/golden/host-settings-limits.json` is a new golden file. It lists what every
`HostSettingsStore` adapter and the desktop shell's Rust side must agree on, so the two
languages are tested against one list instead of two copies of the rules:

- `keys`: keys `isHostSettingKey` allows and refuses (the form, 64 characters, `__proto__`, paths).
- `sizes`: values that bring the settings to exactly 256 KiB and one byte over, in one-, two-,
  three- and four-byte characters and in quotes, so the limit is counted in UTF-8 bytes of the
  compact JSON.
- `saved`: saved texts, what `read` gives for each (or none saved), and the text after saving the
  turn limit 24 over it: unknown keys, fields and a newer `version` kept; unparsable text replaced.

The port's tests, the contract suite (so every TypeScript adapter) and, in PR 7d, the Rust crate's
tests read it. No existing golden file or test was changed or removed.

## Covers

- packages/core/ports/src/golden/host-settings-limits.json
