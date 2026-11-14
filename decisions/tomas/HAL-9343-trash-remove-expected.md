# Decision: a store's remove takes `expected`, so the trash can't delete an edit

- Approval: scope decided on HAL-9343 (Liam); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VQenYj4Qs6oE6LpBbitvQYerSDRyXDXwVYPDv3Y2EozbGfWprERT0upr1+801setiAmIEQiGIbk9ONJzkw++Ag==

## What changes

`ports.definition-store-write-if-unchanged` grows: `remove(path, { expected })` removes the file only
if it still holds what the caller read, and otherwise returns `changed-on-disk` with the file's
current text and removes nothing. A remove without `expected` works as before. Two examples are
added to the requirement; no example was removed or weakened. The shared `definition-store` contract
suite gets the matching cases (file changed, unchanged, gone, unsafe path), which every adapter runs.

## Why

`FolderTrash.moveToTrash` checked the file and then removed it in two steps, so an edit made between
the two was deleted. With `expected` the store makes the check and the remove one step.

## Covers

- ports.definition-store-write-if-unchanged
