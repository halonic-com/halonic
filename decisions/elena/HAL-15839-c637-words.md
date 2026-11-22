# Decision: doctor's Profile line says "your profile folder" and starts with a capital

- Task: HAL-15839, from words check C637 rows 57 and 58 (HAL-15824)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15839 (wording fixes in command output, so a team decision under the HAL-2282 rule; Liam's code review signs this note)
- Kind: user-visible

## What changes

- `cli.commands.doctor.profile-line` (edited): the Profile line's reason is "Your profile folder, set by HALONIC_HOME, is inside this workspace." in place of "the profile folder HALONIC_HOME is inside this workspace.", and "This workspace is inside your profile folder <profile>." in place of "this workspace is inside the profile folder <profile>.". The requirement says the reason starts with a capital; the fixes stay as they are. The examples and the tests that checked the old words check the new ones, and none is weakened.
- `cli.profile-outside-workspace` (draft) gives the refusal the same words after its colon, in lower case.

## Why

Every other doctor line starts with a capital. "the profile folder HALONIC_HOME" reads as a folder called HALONIC_HOME; "set by" says the variable chose the place.

## Covers

- cli.commands.doctor.profile-line
