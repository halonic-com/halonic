# Decision: the launcher sets its own values for the Windows variables libuv adds

- Approval: Liam reviews this on HAL-7673
- Kind: internal
- Task: HAL-7673

## What changes

On Windows the launcher passes a fixed value for each of the 11 variables libuv would otherwise
fill in with the user's own: `USERNAME`, `USERPROFILE`, `USERDOMAIN`, `HOMEDRIVE`, `HOMEPATH`,
`LOGONSERVER`, `TEMP`, `SYSTEMDRIVE`, `SYSTEMROOT`, `WINDIR` and `PATH`. The runner learns
nothing about the account or the profile folder.

## Why

HAL-7555 recorded this as the A17 known gap. The note
`decisions/ravi/HAL-7555-windows-runner-attacks.md` still lists A17 as a gap, because notes on
`main` are append-only. This note supersedes that line: A17 is now expected `refused` in
`runner-attacks.windows.test.ts`.
