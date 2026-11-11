# Decision: compare a path with a working folder in one place

- Approval: Julian's security review on [HAL-4728](/HAL/issues/HAL-4728) asked for this follow-up; the choice (refuse, not record) is on [HAL-4732](/HAL/issues/HAL-4732), with Julian's security check and Liam's review of the pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:f095ks0RwS9EjSM6c3UMKctFFEVYeUa9JGEWzVjr7U4iwMbncfuf2owKsHCRF/2n+1X9U8/3a9A+y2ar+TPhDg==
- Task: HAL-4732

## What changes

`format.agent-sandbox-fields` gains one sentence and one example: `isInWorkingFolder(path,
folder)` says whether a path relative to the workspace is a working folder or inside it. It
compares the paths as a file system that ignores case reads them, with `\` as `/`, `.` and `..`
resolved and trailing dots and spaces dropped. An absolute path, or one that leaves the
workspace, is never inside. Nothing about which working folders are accepted changes: every
existing check and test stays as it is.

## Why

The new workspace check `workspace.working-folders` refuses a harness agent's working folder
when it holds what a local connector starts in or runs. A harness agent writes there from inside
the sandbox, while the connector's program runs outside it with the connector's secrets.
Comparing the paths is a format rule, next to the rules for what a working folder may be, so the
step that later builds the sandbox profile and starts programs can use the same comparison.

## Covers

- format.agent-sandbox-fields
