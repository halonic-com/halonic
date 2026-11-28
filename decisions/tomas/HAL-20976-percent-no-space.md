# Decision: Sync diagnostics writes "5%", not "5 %"

- Task: HAL-20976 (from the words check on HAL-20969)
- Approval: the words check on HAL-20969 asked for this change on HAL-20976; the package owner approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8Iav8aXIa90GiYCXh7hgxemLo73tMlOY0D0AauciycYu9TnjdmW2wrzdS46EoBnXNMDjezqHr/I8YfCF8N6vBg==

## What changes

`connections.sync-diagnostics` writes a percentage without a space before the sign: the column
"Slowest 5%", a share such as "3 (75%)" and "… for the slowest 5%". The rule's sentence and its
example change the same way. The section test now expects "3 (75%)", "1 (25%)" and "for the
slowest 5%".

## Why

The rest of Studio writes "1%" and `${leftPercent}%` without a space, and #6880 made the same
change in a changeset. Sync diagnostics hasn't been released yet, so nobody saw the old text.

## Covers

- connections.sync-diagnostics
