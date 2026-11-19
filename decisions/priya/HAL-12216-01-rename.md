# Decision: the item page's name field can say why a name can't be kept

- Task: HAL-12216
- Approval: UX checklist 10.2 in T7's approved scope (HAL-1300, HAL-12216); Liam approves this note in review
- Kind: user-visible

## What changes

- `shell.item-page-header`: `NameField` gets an optional `check`. Where a page passes one, the reason a new name can't be kept shows under the field as it is typed, tied to the field as its description. Enter leaves that name in the field without keeping it, and leaving the field puts the old name back. Pages that pass no `check` work as before.

Nothing is removed or weakened. An example for the check is added to the requirement, and tests for it are added to `name-field.test.tsx`.

## Why

Checklist 10.2 asks that a workflow is renamed from its page header, and that a name another workflow already has is refused with a reason before it is applied. The header's name field is the shell's, so the check belongs there, where every item page can reuse it, rather than in a second field on the Workflows page.

## Covers

- shell.item-page-header
