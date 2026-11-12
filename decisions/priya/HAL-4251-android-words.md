# Decision: `shell.window-keys` says the Android app, not the phone

- Requirements: `shell.window-keys` (`packages/studio/shell/requirements/window-keys.md`)
- Task: HAL-4251 (found by the words check on HAL-4240, PR #1329)
- Approval: HAL-4254, the CTO's review of PR #1343
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:eX0epjjs044HH4hv4Rv+nTcsloQjTFO+PHPhasFTA0n5CWzoyV+Fe+HICSIGxV0ey0v3rW5eGLrSP969KlzXCw==

## What changes

The requirement's last sentence said that served Studio "and the phone" bind none of the window
keys. The glossary says Studio runs on the desktop, on Android or in the browser, so it now says
the Android app. What the shell does doesn't change: the Android app still binds none of these keys.

## Why

Words only, to match the glossary. The code value `StudioHost = "phone"` stays as it is; renaming it
is a wider change than this fix.

## Tests

No test was weakened. One test title says "the Android app" instead of "the phone"; its assertions
are unchanged.

## Covers

- `shell.window-keys`
