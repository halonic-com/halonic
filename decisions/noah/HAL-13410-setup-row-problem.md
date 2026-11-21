# Decision: a setup step's circle can show its check, so kit.setup-steps leaves the circle to it

- Task: HAL-13410
- Approval: team decision on the approved first-run-progress design (HAL-7986, section 3.1 and section 8 "Decided by the team", board yes on HAL-7993); the reviewer of the pull request on HAL-13410 signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WdqG4SvMxh5/MBA+FMhd28WTBsc2IGyEu/b5h2hI2MzdChQYZ6vwlKvOgx62pp6HJb5uGCdQ/FEslHoHQ+PSDg==

## What changes

`kit.setup-steps` said that while a step isn't done, its circle is outlined in `border-strong` with its number in `fg-muted`. A step can now have a `check` (the new `kit.setup-steps-check`): while it runs, the circle is outlined in `running`; when it finds a problem, the circle is amber with a "!". So the sentence now says the circle is outlined in `border-strong` **unless its `check` draws it**, and the title in `fg` and the chevron stay for every step still to do. Nothing else in the requirement changes, and no test of it changes: a step without a `check` is drawn exactly as before, so the Try the sample card looks the same.

The new parts have their own requirements and tests: `kit.setup-steps-check` (the waiting and problem states) and `kit.list-row-actions` (a List row's `under` part and its text-button `actions`, each a cell of the grid).

## Why

first-run-progress 3.1 gives a setup row that checks something two more states, and section 8 records them as a team decision on approved screens. The circle is where the row shows its state at a glance, so the requirement that fixed its colour has to leave room for them. It's internal for now: no screen passes a `check` yet. Home's own-workspace Get set up (HAL-14646) and the Inbox's first-run setup item (HAL-13433) will.

## Covers

- kit.setup-steps
