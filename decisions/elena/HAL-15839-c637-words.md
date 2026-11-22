# Decision: doctor's Profile line and the refusal say "your profile folder <path>" and Studio's fix

- Task: HAL-15839, from words check C637 rows 57 and 58 (HAL-15824); HAL-15892, from flow check C646 (HAL-15887)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15839 and https://paperclip.halonic.com/HAL/issues/HAL-15892 (wording fixes in command output, so a team decision under the HAL-2282 rule; Liam's code review signs this note)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Tv5ZAwSn7Izu2aOtk7vIoAQO+5a0md3SxyVpd9d3ip/uSZvfO3E0g5lxSWyIXdwaGf99I6ZuIMtPaiuu93E2Dg==

## What changes

- `cli.commands.doctor.profile-line` (edited): when a variable put the profile in the workspace, the Profile line's reason is "Your profile folder ~/acme/.profile is inside this workspace." in place of "the profile folder HALONIC_HOME is inside this workspace.", and the fix under it is Studio's, without its restart: "Fix: a change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place.", led by "XDG_DATA_HOME puts it there." when another variable than `HALONIC_HOME` put it there. When the workspace is inside the profile, the reason is "This workspace is inside your profile folder <profile>." in place of "this workspace is inside the profile folder <profile>.". The requirement says the reason starts with a capital. The examples and the tests that checked the old words check the new ones, and none is weakened: the tests now also check the path and, for `XDG_DATA_HOME`, the variable in the fix.
- `app.doctor-profile` (edited): the Profile line for a moved profile also carries the profile's path (`profile` in `--json`, next to `movedBy`), as the line for a workspace inside the profile already did. Nothing is taken away.
- `cli.profile-outside-workspace` (draft) gives the refusal the same words after its colon, in lower case.

## Why

Every other doctor line starts with a capital. "the profile folder HALONIC_HOME" reads as a folder called HALONIC_HOME and gives no path, and the CLI and Studio worded the same refusal two ways (C646). Studio's fix, with the path the CLI can show, is now the one wording for both.

## Covers

- cli.commands.doctor.profile-line
- app.doctor-profile
