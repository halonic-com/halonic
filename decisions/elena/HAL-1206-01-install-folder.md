# Decision: the Windows installer test installs into the default folder

- Task: HAL-1206
- Approval: Liam approves this note in review on the review task of HAL-1206
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the Windows installer job's silent install no longer passes
`/D=<runner temp>\Halonic`. It installs into the installer's default per-user folder, which this
pull request moves to `%LOCALAPPDATA%\Programs\Halonic`, and checks that Halonic is there and not
in the profile folder `%LOCALAPPDATA%\halonic`. Before that install it deletes the current user's
`Software\<publisher>\Halonic` key when it holds the page walk's folder: the page walk's silent
uninstall keeps that remembered install location, and the next install would go back there
instead of to the default. The later steps use `HALONIC_TEST_DIR` as before,
so they test the same files in the new place.

Triggers, rights, runners and secrets don't change.

## Why

Tauri's per-user default, `%LOCALAPPDATA%\Halonic`, is the same folder as the profile on Windows,
which ignores case. Failure path rule 2 keeps user data out of the folder an update replaces. A
test that always passes `/D=` never sees the default, so it couldn't catch this.

## Tests

No test was weakened or skipped. The install step checks one thing more.

## Covers

- .github/
