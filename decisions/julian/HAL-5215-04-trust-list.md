# Decision: a POSIX-only test for `halonic trust --list`

- Task: HAL-5215
- Approval: assigned by Liam on [HAL-5215](/HAL/issues/HAL-5215); Liam approves this note in review there
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:skUIWVgVhILcBnhtW2cE2xI/dOHzhize+XB50C4XCdONn/uMkiQtBH6KgX7zyBIZQDNhZx28RHDeC5yHOIkdAA==

## What changes

`halonic trust --list` reads only each trusted workspace's `workspace.yaml` to show its name,
instead of loading the whole workspace. A folder elsewhere in one workspace that can't be read no
longer stops the list from showing every trusted workspace.

The new regression test makes a folder in a trusted workspace unreadable with `chmod 000`. It is
skipped on Windows, where POSIX modes don't apply, and as root, who can read it anyway, the same
way as the existing unreadable-folder tests in `workspace-dir.test.ts` and
`commands/validate/command.test.ts`. Its name starts with `[platform:win32]`, so the skipped-tests
reporter counts it as a platform skip.

## Why

The test needs a folder the account can't read, and only POSIX modes give one that a test can make
and undo.

## Tests

No test was weakened or skipped on Linux or macOS. The new test fails on `main` (exit 2) and passes
with the fix.

## Covers

- apps/cli/src/commands/trust/command.test.ts
