# Decision: a plugin record file or folder is read by your user account

- Approval: the task HAL-16617 asks for this change, from words check C731 (HAL-16608), rows 51, 54 and 55. The team decides it under the HAL-2282 rule, since it rewords messages that are already there. Liam signs this note in review.
- Kind: user-visible

## What changes

- `cli.plugin-record-unreadable`: the refusal says "The plugin record file <file> can't be read by your user account." and "The plugin records folder <folder> can't be read by your user account." instead of "… can't be read by you.". The requirement's text and its example change to match. The fix lines, the exit codes and the damaged-file refusal don't change.
- `words.doctor-plugins`: the doctor's Plugins line uses the same words for the file and the folder, word for word. Its fixes don't change.

## Why

C731 rows 51 and 55: Halonic is the one reading the file, and the plugins folder (`cli.plugins-folder-unreadable`, HAL-15898) and the secrets file (HAL-15771) already say "can't be read by your user account.", the account the fixes under it name. Both requirements are still unreleased.

## Tests

No test was weakened or skipped. `plugin-record-store.test.ts`, `command.plugin-records.test.ts` and `doctor-lines.plugins.test.ts` expect the new words; every assertion stays.

## Covers

- cli.plugin-record-unreadable
- words.doctor-plugins
