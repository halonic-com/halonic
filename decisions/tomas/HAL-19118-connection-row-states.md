# Decision: list all four connection states in one place in `connections.connection-row`

- Approval: docs check HAL-19112 of the pull request for HAL-19032 asked for it (fix task HAL-19118); wording approved by Sofia on HAL-19034; Liam signs this note in his review of the pull request on HAL-19118
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DbyVmI3KC4Gb4RJhAjthD8e74TAxL/SU+y9PZzbhA8J2gg3y7U8BnEgus+f1PFsNHNtjLQgmKWPHAjJEZt0qDQ==
- Task: HAL-19118

## What changes

The requirement's first sentence listed a row's states as "Connected", "Offline" or "Signed out"
and named "Not connected" only in the next sentence, so a reader saw two sets. The first list now
names all four states, their detail texts and both buttons (Sign in again, Sign in). Nothing the
row shows or does changes, and no test changes.

## Covers

- connections.connection-row
