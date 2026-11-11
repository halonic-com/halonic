# Decision: mode 000 folder tests skip on Windows and as root

- Requirements: `workspace.unreadable-folder` (`packages/core/workspace/requirements/unreadable-folder.md`), `fs-node.unreadable-workspace-folder` (`packages/adapters/fs-node/requirements/unreadable-workspace-folder.md`)
- Task: HAL-4561, which asks for a test with a mode 000 folder, skipped on Windows and as root
- Approval: the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HSS6LJc9l9OruzFlP2ST7vblo6q+cMza89RejdHH2l1qvIRKqehPC+vAzstsP7Wdr3lbb7IyVt0+dW5FM9VKDQ==

## What changes

Three new tests set a real folder to mode 000 and skip with
`it.skipIf(process.platform === "win32" || process.getuid?.() === 0)`, as the mode 000 file test
from HAL-4511 (#1451) already does. Their names start with `[platform:win32] has no read permission
bits:`, so the skipped-test reporter accepts the skip on the Windows job and lists it:

- the CLI test that `halonic validate` names a folder it can't read and exits with 2;
- the folder store's test that `list()`, `list(dir)` and `version()` throw an
  `UnreadableWorkspaceFolderError` naming the folder;
- the folder store's test that a root it can't read passes on the file system's error.

Windows has no read permission bits, so `chmod 000` doesn't stop a read there, and root reads any
folder whatever its mode. CI runs on Linux as an ordinary user, so all three run on every pull
request. The loader's own handling is covered on every platform by unit tests with a source that
throws the error, in `load-workspace.test.ts`.

## Tests

No test was removed or skipped that ran before. The folder store's existing test "passes on a file
system error other than a missing entry" no longer expects `list()` to reject with a bare `EACCES`
for a folder under the root, because it now throws the named error; that case moved to the new
test, which also checks the `EACCES` as the error's cause. Its `read()` check stays as it was.

## Covers

- apps/cli/src/commands/validate/command.test.ts
- packages/adapters/fs-node/src/definition-store.test.ts
