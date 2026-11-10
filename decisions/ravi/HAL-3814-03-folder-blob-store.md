# Decision: three Unix-only tests for the folder blob store

- Requirement: `fs-node.blob-store-files` (`packages/adapters/fs-node/requirements/blob-store-files.md`)
- Task: HAL-3814; the plan for `halonic run`, PR A, approved on HAL-3895
- Approval: the maintainer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AHEPaqgHxnHZJrBJKprpUoGmM8brr1QAUNhR93oFHpVr+EHCD+/BudF4c6Qx3GsN5218Z8a1x8Ydp2qNCQpXBg==

## What changes

The new `FolderBlobStore` gets its own requirement and tests. Three of the tests run only on
Unix, with `it.runIf(unix)`, the way the trust store's and record store's tests already do with
`skipIf(win32)`:

- **Modes:** the folders get mode `700` and the files `600`. Windows has no file modes; there the
  profile folder's own permissions protect the blobs, as `makePrivateFolder` says.
- **A symbolic link in a blob's place:** making one on Windows needs a privilege (Developer Mode or
  an administrator) that a test can't count on.
- **A symbolic link in place of a blob's folder:** a put refuses it (Tomas, HAL-3912). It needs
  the same privilege on Windows.

CI runs on Linux, so all three tests run on every pull request. The hard-link test needs no
privilege, so it runs everywhere.

## Tests

No test was removed or loosened. The three tests are new and skip only on Windows.

## Covers

- packages/adapters/fs-node/src/blob-store.test.ts
