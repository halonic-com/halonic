# Decision: the runner start gate can pick MXC, and the switch stays off

- Approval: Liam approves this note in review on HAL-9171
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZzWqm+ddiXB+289aYMS62aqtMkafUYgo4qXaen6QEdZRHiuhvNJ+WRjPCD/AAgWax12+miGcSG0r6VcQIGJdBg==
- Task: HAL-3403

## What changes

- `app.runner-start-gate` now says that, when the gate picks MXC (`sandbox-mxc` on Windows 11), the
  runner starts with the MXC profile (`integration-runner.mxc-profile`): read grants only, one
  folder to write in, no network, no denied or reopened paths.
- MXC fences the runner only while `mxcFencesRunner` is on. It ships as `false`, so nothing
  changes for any user until the board turns it on.

## Why

MXC reads only what a grant names and takes no reopened paths, so the srt profile (deny the home
folder, reopen what the runner needs) does not fit it. A separate profile keeps the two shapes
apart and keeps the refusal of the home and socket folders. The profile also has no settings
folder and denies the key store, as the A6 ruling on HAL-3403 requires.

## Covers

- app.runner-start-gate
