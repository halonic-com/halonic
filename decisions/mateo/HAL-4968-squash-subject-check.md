# Decision: the pull request checks read the subject that will land on main

- Task: HAL-4968 (halonic#1581 was dropped from the merge queue several times for a too-long squash subject)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-4968](/HAL/issues/HAL-4968)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:p7JU/qeOH2740cz7XDcBxvEV8gv27fN9YwgFVyfhyj97kteE3gsAohHWUhUwpfmEdjWG4vojycWX66Z/y+dzBQ==

## What changes

`pnpm check:pr-title` now also checks a one-commit pull request's own commit subject, because that is the squash commit's subject, with the same rule as the title. It reads the commits from `PR_RANGE` (`base..head`), which the CI step on `pull_request` now sets. With several commits, only the title is checked, as before. `pnpm check:enqueue` runs the same check first, with the title read from `gh` when it is signed in, so an author learns it before queueing.

## Why

The `pr-title` check read only the title, so a pull request with one long commit subject was green, then failed the queue's _Squash commit subject_ step and lost its slot.

## Tests

No test was weakened or skipped. `pr-title.test.ts` gains four cases: one commit with a long subject, one commit with a fine subject, a fine subject with a long title, and several commits (title only).

## Covers

- tooling/check/
- .github/
