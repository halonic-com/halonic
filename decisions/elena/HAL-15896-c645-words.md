# Decision: a stopped integration's CLI line has one colon less, and Try again's line says "again" once

- Task: HAL-15896
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15896 (words check C645 rows 25 and 27, found on HAL-15886; wording on approved screens and in command output is a team call under HAL-2282, recorded on HAL-15896)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/4T7DKsF+F/mXX7+F7Jvn3VffPtkY0rlCILlQrNW18xwfPzu/N+6vy42cRTyHPbqtTyCfNfNJdE9nzTRWNnyBQ==

## What changes

Three active requirements are edited:

- `cli.local-integration-stopped`: the message is now "the sandbox didn't work when the integration <folder> started, so none of it ran. Halonic tries <folder> in the sandbox again the next time a run uses it." Before, it started "Halonic stopped the integration <folder>: the sandbox didn't work when the integration started".
- `plugins.plugin-cards` and `plugins.plugin-commands`: the second line is now "Try again starts it in the sandbox. Open *name* for details." Before, it said "starts it in the sandbox again".

The tests that check those words now check the new ones; no test was weakened or skipped. What the CLI, the card and the dialog do is unchanged.

## Why

The connector's start error wraps the integration's message, so a person read three colons in one line: "Connector "notes" didn't start: Halonic stopped the integration notes: the sandbox …". The new shape is the one `halonic run` already uses for a plugin ("The sandbox didn't work when the plugin Weather started, so none of it ran."), lower case because it follows the connector's colon.

"Try again starts it in the sandbox again" said "again" twice in five words; the button's name already says it.

## Covers

- cli.local-integration-stopped
- plugins.plugin-cards
- plugins.plugin-commands
