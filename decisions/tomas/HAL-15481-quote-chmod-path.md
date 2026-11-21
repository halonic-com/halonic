# Decision: the chmod fix for a readable secrets file writes its path for a shell

- Task: HAL-15481
- Approval: team decision under the HAL-2282 rule for small wording on approved screens and command output (C584 rows 18–21 on HAL-15471); the reviewer of the pull request on HAL-15481 signs this note
- Kind: user-visible

## What changes

- `secrets-file.private`: the store's fix, `chmod 600 <file>`, writes the file as one shell word with the existing `std.shell-word` (as it is when plain, double-quoted with `"`, `$`, `` ` `` and `\` escaped otherwise), the rule the CLI and Studio already use for their other commands. A new example has a macOS file in `Application Support`. The cause still names the file as it is.
- `cli.run-failure`: line 2 for `secrets.file-readable` writes the file the same way, with the CLI's own `shellWord` (the same POSIX rule), so `halonic run` and `halonic secret list` give the same command. A new example has the macOS file.
- `runs.run-view.failure-banners`: the secrets-file banner (F24) is now written down, and its sentence, the phone line and **Copy command** give the command with the file written the same way; the first sentence keeps the file as it is, because there it names the file. A new example has the macOS and the Linux file.

## Why

On macOS the profile folder is `~/Library/Application Support/halonic`, with a space. Typed or pasted as shown, `chmod 600 <file>` got two paths and failed, and the file stayed readable. Only Studio's Copy command quoted the path, so the phone and the CLI, which have no button, gave a command that didn't work.

## Options weighed

The task asked for single quotes, which would also stop a `!` from bash's history expansion. A new helper for that would have been a second quoting rule next to `std.shell-word`, which every other copyable Halonic command uses, and a new dependency of Studio's runs feature on `ports`. A profile path with a `!` is rare, so this keeps one rule.

## Tests

No test was removed or skipped. One expectation changed: Copy command for the plain test file `/profile/secrets/secrets.json` now copies it without quotes, as the sentence shows it and as F24's Linux example says; quoting is still checked for a path with a space and with a `$(…)`, which stays text. New tests cover the store's fix, the CLI's line 2 and the Studio banner with a macOS path.

## Covers

- secrets-file.private
- cli.run-failure
- runs.run-view.failure-banners
