# Decision: HALONIC_HOME's refusal in plain words, and trust's lead-in says what it was doing

- Approval: HAL-15429 (Sofia's C576 check on HAL-15424, rows 1, 2, 4, 5 and 10, decided by her as team wording under HAL-2282) and HAL-15427 (Nina's C572 check on HAL-15420)
- Kind: user-visible
- Task: HAL-15427, HAL-15429

`halonic trust --list` and `halonic trust --remove` led every error with "Couldn't trust this
folder", though neither trusts anything. The reason said "absolute folder" while its fix, the
README and the changeset said "full path". On Windows the fix said `$HOME\.halonic`, which a user
environment variable doesn't expand, so following it gave the same error again. The
`cli.profile-home` requirement and its first example wrote those lines down, so they change with
them. Nothing a run may do changes: the same values are refused as before.

## Covers

- cli.profile-home

## What changes

- `cli.profile-home`: the reason is "HALONIC_HOME must be a full path, not …". The fix after a
  `~` says "Inside quotes the shell doesn't turn ~ into your home folder. Use $HOME instead: …".
  On Windows the fix names the person's home folder, followed by `\.halonic`, also for a
  `~`. `trust --list` leads with "Couldn't list the trusted workspaces and plugins", `--remove`
  with "Couldn't remove the trust from <folder or plugin>", and plain `trust` keeps "Couldn't
  trust …". Sofia's text said "the trusted workspaces"; "and plugins" is added because plugins'
  trust is in the same list (#4670 names them there).
