# Decision: `pnpm check` fails a migration that drops, renames or changes a column

- Task: HAL-6704 (deploy engine, part 3b; rule decided in HAL-6804)
- Approval: the task asks for this change; Liam approves this note in review and signs it
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:whARc1aJcdhnjE/+MOr2LP1ogK/QiGlu36OH4Q5EzOfAs6fDG9U16crm8Ridh5RTFyn9rGlCc1egWWuBLUq6CQ==

## What changes

A new `migrations-additive` rule in `tooling/check` reads numbered files in a `migrations` folder. It fails a migration that drops something, renames something, changes a column's type or constraint, or adds a NOT NULL column with no default. It reports file and line and skips comment lines.

## Why

Deploys apply migrations before the new Worker version goes live, so the old version must keep working on the new schema. Only additive migrations guarantee that. A CI rule catches a breaking migration before it ships.

## Tests

The rule's tests cover each failing case and the passing cases. `pnpm check` reports 0 errors.

## Covers

- tooling/check/
