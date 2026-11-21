# Decision: HALONIC_HOME must be a full path, a Windows fix with the home folder, and trust's prefix by mode

- Approval: Sofia decides these words on HAL-15429 (https://paperclip.halonic.com/HAL/issues/HAL-15429), from her C576 check (HAL-15424, rows 1, 2, 4, 5 and 10) of #4579. Details of approved command output, so a team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

- **The reason (row 1).** The profile package's `RangeError` for a relative `HALONIC_HOME` says
  `HALONIC_HOME must be a full path, not "~/.halonic".` instead of "an absolute folder", so the
  reason, the fix, the README and the changeset all say "full path". The CLI shows that sentence.
- **The fix after a `~` (row 2).** `Inside quotes the shell doesn't turn ~ into your home folder.
  Use $HOME instead: HALONIC_HOME="$HOME/.halonic".`
- **Windows (row 4).** The fix names `.halonic` in the person's own home folder, such as
  `Set HALONIC_HOME to a full path, such as <home>\.halonic.`, for a `~` value too. The README says
  to set it as a Windows user environment variable, where nothing turns `$HOME` into the home
  folder, so the old example gave the same error again.
- **`trust`'s prefix (row 5).** `trust --list` says "Couldn't list the trusted workspaces: …" and
  `trust --remove` "Couldn't remove the trust from Acme: …" ("from this folder" when no `--dir` or
  `--plugin` is given). Plain `trust` stays "Couldn't trust Acme".
- **The CLI README (row 10)** quotes the new sentence and adds the Windows example.

`profile.profile-folder` now says the sentence and checks it in its test. `cli.profile-home`'s
first example is `trust --list`, so it says the list prefix, and a Windows example is added. No
test was weakened or skipped: the existing tests check the new words, and new ones cover the
Windows fix for `~` and the three prefixes.

The Studio's Rust profile crate keeps its own sentence; it isn't one the CLI shows.

## Why

One thing, one name: the reason said "absolute folder" while everything around it said "full
path". The Windows fix sent people to an example that can't work where they set the variable, and
`trust --list` reported a failure to trust when nothing was being trusted.

## Covers

- profile.profile-folder
- cli.profile-home
