# Decision: an empty required command field says "Fill this in."

- Approval: Sofia, the plugin screens' designer, decided D5 in the UX acceptance check of the
  plugin screens on [HAL-1952](/HAL/issues/HAL-1952) (small wording on an approved screen, a team
  decision under HAL-2282); the package's reviewer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TxWs9T1DRfKQhwpPwizsWB6LHVqoRBvHEEfk23DIzJwwYBT7l1Yu8LhaltH2RQyzr3VyxhmSubzalIvFqC/kCA==
- Task: HAL-1740

## What changes

A required field left empty in a plugin command's dialog says "Fill this in." instead of "Fill
this in: it is required.". The `plugins.plugin-commands` example that quoted the old line now
quotes the new one; its statement is unchanged. In `plugin-command-dialog.test.tsx` the assertion
for that field changes from `toContain("Fill this in: it is required.")` to
`toBe("Fill this in.")`.

## Why

The reason after the colon repeats the field's star, and the colon shape is kept for failures
("Couldn't …: *reason*."). Studio can't build a sentence that names what to enter, because the
field's label is the plugin's untrusted text, so a short generic line is the only safe form (D5).

No test was weakened or removed: the changed assertion is stricter, an exact match on the new line.

## Covers

- plugins.plugin-commands
- packages/studio/features/plugins/src/commands/plugin-command-dialog.test.tsx
