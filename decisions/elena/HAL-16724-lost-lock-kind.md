# Decision: a lock the shell couldn't take back has its own lost-lock toast

- Task: HAL-16724
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16724 (row 11 of the words check C754 on HAL-16719, approved on HAL-16722; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:b9Dg8atVDouj8vFEilr3pXZJ7jxuwNjrr2EjstnSE9N/b6PRks2OHob8w9Huc8SP8TqV+P3EQ4zIba6Tdo6lBQ==

## What changes

Since HAL-16342 the shell can lose a workspace's engine lock because it couldn't take its own lock
back after missing its renewals, while nobody took it over. The toast still said "Another Halonic on
this computer took over Acme's runs." for that. The shell now sends the kind of loss, `taken-over`
or `io`, next to its message, the Tauri engine lock passes it to `onLost`, and the toast for `io`
says "Halonic lost its hold on Acme's runs." and "This window stopped running them. Open Acme again
to run them here.", with the same **Open Runs** button. A loss to another process keeps its toast.

`studio.engine-lock-lost-toast`, `fs-tauri.engine-lock` and `studio.src-tauri.engine-lock-commands`
gain the `io` case, each with an example; the existing examples now also name the kind
`taken-over`. No example was removed and no test was weakened or skipped.

## Why

The old toast told the person another Halonic had their runs when none did, so they looked for a
process that wasn't there instead of opening the workspace again (C754 row 11).

## Covers

- studio.engine-lock-lost-toast
- fs-tauri.engine-lock
- studio.src-tauri.engine-lock-commands
