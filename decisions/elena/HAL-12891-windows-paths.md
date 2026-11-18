# Decision: cut long folders at "\" too, and say "Documents" in the sample's lines

- Task: HAL-12891
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12891 (Sofia's C94 UX check on HAL-12884, rows WD1.1, WD1.3 and WD1.6; "Documents" is a team decision on an approved line, HAL-2282 rule, microcopy revision 116)
- Kind: user-visible

## What changes

- A Recent row on Welcome cuts a long folder in the middle after the last "/" or "\" before the
  cut point, so a Windows folder's end starts on a whole folder name, as a POSIX folder's did.
  The sidebar's workspace switcher uses the same middle cut instead of cutting its folder at the end.
- The sample's lines say "Documents", the same on every computer: "Creating the Acme sample in
  Documents…" and "Can't create the sample in Documents: *reason*." Folder lines that show a path
  stay as they are.

The requirements `shell.welcome-recent`, `shell.welcome-sample` and `shell.welcome-cant-open` change
their wording to match. No test was weakened or skipped; the Windows cut has new tests.

## Why

"~/Documents" means nothing to most Windows users, and a Windows folder cut at its end or in the
middle of a name doesn't say which folder it is.

## Covers

- shell.welcome-recent
- shell.welcome-sample
- shell.welcome-cant-open
