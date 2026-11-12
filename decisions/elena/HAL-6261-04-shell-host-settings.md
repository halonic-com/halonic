# Decision: the served Studio keeps its host settings in memory

- Requirement: `studio.entry` (`apps/studio/requirements/entry.md`)
- Task: HAL-6261 (PR 7d of the settings host API, design on HAL-6159)
- Approval: Liam approved this part in his review on HAL-6545 and approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OPUGrhvZopPT1HlhZ4CU3U1KcQNpjUJ8J8/o11io8qzCs3LAY3U38Zu8RakXgwWp6Y84jIjDJ/5Cf66xAXIZAA==

The desktop app now gives each opened folder the shell's host settings, the profile's
`settings/host.json`. The served Studio has no shell, so it can't reach the profile. Rather than
leave it with no `HostSettingsStore` at all, it now keeps its host settings in memory
(`MemoryHostSettingsStore`), as the design's table names for the browser demo, until
`halonic serve` gives it the server's. They last until the page is closed.

`studio.entry` gains half a sentence saying so, and one example: settings saved through the
served Studio's store read back. Nothing the requirement said before changed, and no test was
removed.

## Covers

- studio.entry
