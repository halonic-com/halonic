# Decision: History rows on a phone, with chevrons and "Not shared yet"

- Task: HAL-1302 (T9, phone, audit item 8, fourth part)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (checklist part 2, 2.12, from the board-approved phone design of source control)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZDSheLB2wGwRX3EQ1zn1TmUGCyMwYayBdSSgCbrXbkxtIAtzN6DuhvzGt4KF2vIVsFhMX8vb/gZ36DqXH8FYDQ==

## What changes

Two new requirements and one changed requirement:

- New `kit.list-chevrons`: a List with `chevrons` ends each row in a 20px `fg-subtle` chevron on a phone, hidden from screen readers, and its trailing chip starts the meta line, as a row with a More button already does (kit 6: on a phone the right edge has one job). Desktop rows don't change.
- New `source-control.history-not-shared`: the feature reads which versions in History the shared copy lacks (one more `git log --format=%H` over the same range the "N versions aren't shared yet" count uses, limited to the workspace folder, nothing fetched). On a phone those rows carry a neutral "Not shared yet" chip, and every History row ends in a chevron. Without a place to share to, or when git can't say, no row has the chip.
- `source-control.changes-phone` gains one sentence and one example: when a later read no longer has the open version, the Changes page shows again and stays there when the version comes back. Before, the page jumped back to the version by itself (Liam's review note on #3572). The test fails without the fix.

Nothing is removed; no test is weakened or deleted. The phone test file now uses the shared `buttonsNamed` helper in place of its own copies.

## Why

Checklist 2.12: "History rows end in a chevron; 'Not shared yet' is a neutral chip under the meta line" (611 3). The kit had no chevron for rows that open a page, so it is added to the List as a generic option rather than drawn by the feature. The chip is shown only on a phone, as the checklist places it; the desktop checklist (2.9) asks for no mark. Without a share address every version would carry the chip, which only repeats the strip's "Only on your computer.", so it is left out then; decided by the team.

## Covers

- kit.list-chevrons
- source-control.history-not-shared
- source-control.changes-phone
