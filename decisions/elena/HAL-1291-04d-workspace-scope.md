# Decision: an opened folder becomes a real workspace scope

- Approval: the board-approved workspace flow (flow-workspace, HAL-177, 2.1 and 2.2) built in HAL-1291; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:L0PYBvGJgwPtRlSnSFA9KN7c7+RpV7LP4OLHYR2QnYxYm6wjPu4lEeRrOSTriWMRuet7NANmsfd0qZbs0xEXAA==

## What changes

`studio.open-folder` says that an opened folder gets a workspace scope of its own (`openWorkspace`)
instead of bare services. The scope reads and writes the folder's files through the shell's file
commands, and keeps the assistant's changes to review in the profile (`folder: "review"`, part 4a).
The workspace is not trusted yet, so the assistant can write only Halonic items. It is still named
after its folder until its files are read for the trust check, which comes with the trust PR.
`provideShellSecrets` still runs before any feature's services are built.

## Why

The folder opened with no files, no review service and no save, undo or redo, so nothing in the
workspace could work. Parts 4a to 4c made the shell side ready: this is the Studio side. Leaving
the workspace untrusted is the safe default until the trust PR connects `TrustService`.

## Covers

- studio.open-folder
