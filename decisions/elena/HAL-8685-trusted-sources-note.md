# Decision: the trusted sources requirement no longer waits for the folder check

- Approval: Liam asked for this on HAL-8685; the change only records what #2502 (HAL-8614) already delivered
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FL1F5I04QMv32USXpChg5ApH/OXvndpeYBCEHDJEFm5Vv0HmTD8oPYDgIFrXhZNZo+whnEXvbCP/ttvnzhKQCg==
- Task: HAL-8685

## What changes

`workspace.trusted-sources` no longer says the "Folder not found" mark waits for a shell command.
#2502 added `trust_folders_found`, so the desktop app now shows the mark. "Not yet" lists only
clicking a row to open it, which still waits for a window-level command that opens a workspace.
No behaviour changes.

## Why

The "Not yet" paragraph said the desktop app leaves `found` unknown and shows "Trusted *3 Nov*".
That stopped being true when #2502 merged.

## Covers

- workspace.trusted-sources
