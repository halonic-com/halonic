# Decision: Dismiss on the first run's setup item says Help brings the guide back

- Approval: HAL-15609 (flow check C600 #5a and #5b on HAL-15594; a toast on an approved screen, decided by the team under HAL-2282); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1cbFY6Yq5EXgSo523EvsH4/p2+7svus9vibNAS5IEV4+zZ9NuTF9MqVItoAAFIyBC9ZkfeDUhYqqFqE6peE3Cg==

## What changes

`first-run.setup-item`: **Dismiss** no longer "leaves the first run for good". It closes the item,
which still doesn't come back, and shows the info toast "First run dismissed" with the line "To
bring it back, pick Help › First run › Show the guide.". The requirement now names **Show the
guide** (`first-run.help`) as the way back, and the Dismiss example checks the toast.

## Why

Since #4707, `first-run.help` takes a dismissed first run up again at its step, so "for good"
contradicted it. C600 also found that after Dismiss focus lands on "Nothing is waiting for you."
and nothing says the guide can come back; Help is the only way.

## Tests

No test was weakened or skipped. `first-run-setup-view.test.tsx`'s Dismiss test still checks the
item closes and the state is `dismissed`, and now also checks the toast's tone, title and line.

## Covers

- first-run.setup-item
