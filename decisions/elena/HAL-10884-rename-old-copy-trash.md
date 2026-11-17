# Decision: a renamed file's old copy goes to the trash when the new copy is held

- Approval: Liam approves this note when he signs it, after his review of this pull request, for HAL-10884, a
  follow-up of the review of HAL-10834 (#3112)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BiLMcq1tWkcFo9YP+W+eDmdcEWHYIa9TlUj6RxUoMoW8IYIPSpFCA6AQWc0Ahq2WERth73IQ/o5sZNdV/VD8Bw==

## What changes

`app.workspace-rename`: a save writes the new file of a rename before it deletes the old one. When the
new file's write is held because it changed outside Halonic, the old file goes to the trash instead of
being removed. When the new file is written, nothing changes: the old file is removed without the trash.

## Why

Before, the old file was removed for good while the new file's text existed only as an unsaved change. A
discard then lost the text. The trash keeps it.

## What doesn't change

A case-only rename keeps its order, because both names are one file. No test is skipped or weakened: one
test is added.

## Covers

- app.workspace-rename
