# Decision: Windows-only skip in the file secret store's tests

- Requirement: `secrets-file.private` (`packages/adapters/secrets-file/requirements/private.md`)
- Task: HAL-8336 (PR 9a-1b of HAL-195); design approved by Liam on HAL-8325
- Approval: the maintainer approves this note in review
- Kind: internal

## What changes

The new `FileSecretStore` gets its own requirements and tests. The tests of the private file
(`0700` folder, `0600` file, the refusal of a file others can read) run only on Linux and macOS,
through `describe.skip` on Windows.

Windows has no POSIX file modes, so the `0600` check can't run there. The requirement says so, and
the README says the profile folder's own permissions protect the file on Windows.

CI runs on Linux, so these tests run on every pull request.

## Tests

No test was removed or loosened. The tests are new and skip only on Windows.

## Covers

- packages/adapters/secrets-file/src/file-secret-store.test.ts
