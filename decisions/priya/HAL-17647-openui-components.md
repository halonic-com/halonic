# Decision: an inline snapshot of the prompt text for the chat's components

- Requirements: `openui-lang.components` (`packages/core/openui-lang/requirements/components.md`)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17647 (OpenUI A2, which asks for "`promptFor(["card", "table"])` lists exactly those two with their arguments, checked by a snapshot test"; from the OpenUI plan the board approved on HAL-17107)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:V1QRcHUSzWUOK/Obb8JY8eCJUjnXoGmI+lkN3zA0LeL+k06DeiV0+SvJdLkY4Ty2Bju70mvysOL2dThegEDdCQ==

## What changes

`packages/core/openui-lang/src/components.test.ts` is a new test file. It adds one inline snapshot:
the text `promptFor(["card", "table"])` gives, which tells the model which components it may draw
and with which arguments. The task asks for a snapshot here, so a change to the prompt shows up in
review as a diff of the whole text rather than as a few loose `toContain` checks.

## Tests

No test is weakened, skipped or removed. The snapshot is new; every other test in the package is
unchanged.

## Covers

- packages/core/openui-lang/src/components.test.ts
