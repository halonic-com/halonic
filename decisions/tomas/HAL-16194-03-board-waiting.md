# Decision: the board check may read blocker links, and two tests say so

- Approval: Liam reviews the board check's waiting-on-the-board part and signs this note as the CTO
- Kind: internal

Part (b) of the board check (phase 1b, HAL-16194) ranks the tasks waiting
on the board by what they hold up, so it reads Paperclip's blocker links
(`issues.relations.get`, the `issue.relations.read` permission Liam reviewed
on #5127) and, for a task in review listed without review attention, its
pending cards (`issues.listInteractions`).

- The guard test "never touches a call outside its allowlist" checked that
  the board check can't reach `issues.relations` at all. It now checks that
  each relation write (`setBlockedBy`, `addBlockers`, `removeBlockers`)
  throws, and adds that `createInteraction` and `respondInteraction` throw.
  The fake context offers `relations.get` alone, so a write is still caught
  the moment the code reaches for it.
- The `paperclip.pr-tools` test compares the whole list of declared tools;
  it now lists `board_waiting` too. Nothing else it checks changes.

## Covers

- tooling/paperclip/src/plugin/board-check.test.ts
- tooling/paperclip/src/plugin/tools.test.ts
