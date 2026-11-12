# Decision: one Unix-only test for the file host settings store

- Requirement: `fs-node.host-settings-store` (`packages/adapters/fs-node/requirements/host-settings-store.md`)
- Task: HAL-6159 (PR 7c of the settings host API), with the review changes from HAL-6216
- Approval: Liam approved the design on [HAL-6216](/HAL/issues/HAL-6216) and approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wXbLXZ1uC9Njt1F6ksVsCJFwAe4hca4QBc4a5Wg/r8sH4faqhC2VPIcVz+yk8yJUnBIha4tNQiZ/uHCsvLHWCg==

## What changes

The new `FileHostSettingsStore` gets its own requirement and tests. One of them, "throws on a
save when the file can't be read, and changes nothing", runs only on Unix, with
`skipIf(win32 || root)`, the way the definition store's tests for an unreadable folder already do:

- **Windows** has no read permission bits, so `chmod 0` doesn't make the file unreadable there.
- **Root** reads any file whatever its mode, so the test can't make a read fail.

CI runs on Linux as a normal user, so the test runs on every pull request. The other tests of a
file that can't be read (a link, a folder in the file's place) need no permission bits and run
everywhere.

## Tests

No test was removed or loosened. The test is new and skips only on Windows and under root.

## Covers

- packages/adapters/fs-node/src/host-settings-store.test.ts
