# Decision: the paired-phone file's mode and link tests don't run on Windows

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14072 (Liam, CTO; the B2 plan for HAL-12237), security review on HAL-14084
- Kind: internal
- Task: HAL-12237

## What changes

`apps/agent-host/src/remote/private-file.test.ts` is a new test file. Two of its tests skip on
Windows with `it.skipIf(process.platform === "win32")`, each with its `[platform:win32]` reason
in the test's name:

- "keeps the file and its folder private" checks the file is 0600 and its folder 0700. Windows
  has no such file modes, and Node reports fixed values there, so the check means nothing.
- "refuses a link in the file's place" makes a symbolic link first. On Windows that needs an
  administrator or developer mode, which CI's Windows runner doesn't have.

No requirement changes and no existing test is weakened: both tests are new and run on Linux and
macOS, where these protections apply.

## Why

The paired-phone store writes through `privateFileAt` (a flushed 0600 temporary file renamed over
the file, and a link in the file's place refused). The security review (HAL-14084) asked that this
hold. These two tests prove it where it applies; the other tests in the file run on every platform.

## Covers

- apps/agent-host/src/remote/private-file.test.ts
