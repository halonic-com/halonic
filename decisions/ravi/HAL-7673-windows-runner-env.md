# Decision: the launcher sets its own values for the Windows variables libuv adds

- Approval: Liam reviews this on HAL-7673
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:q0Rr0gaE9U0Vt4bWKsbPlRTK5HFWMXBwBShAp7C9dsruxTMgmFL+aHCQ+THaGvNWX9KPxV6154m2iYqyvQ3kBQ==
- Task: HAL-7673

## What changes

On Windows the launcher passes a fixed value for each of the 11 variables libuv would otherwise
fill in with the user's own: `USERNAME`, `USERPROFILE`, `USERDOMAIN`, `HOMEDRIVE`, `HOMEPATH`,
`LOGONSERVER`, `TEMP`, `SYSTEMDRIVE`, `SYSTEMROOT`, `WINDIR` and `PATH`. The runner learns
nothing about the account or the profile folder from these 11 variables, apart from the temp
folder's path (below).

## What stays open

`TMPDIR`, `TEMP` and `USERPROFILE` are the runner's temp folder. That folder is inside the Halonic
profile folder, so on Windows its path runs through the account's user folder and shows
the account name. `process.cwd()` shows it too. A17 is therefore a narrowed known gap, not closed.
Moving the runner's temp folder out of the profile on Windows is a separate follow-up.

## Why

HAL-7555 recorded this as the A17 known gap. The note
`decisions/ravi/HAL-7555-windows-runner-attacks.md` still lists A17 as a gap, because notes on
`main` are append-only. This note narrows that line: the user's own `USERNAME`, `USERDOMAIN`,
`LOGONSERVER` and `PATH` no longer reach the runner. `runner-attacks.windows.test.ts` expects the
fixed values, and checks that the user's own values appear in no variable that doesn't come from
the temp folder.

## Covers

- packages/adapters/integration-runner/fence/runner-attacks.windows.test.ts
