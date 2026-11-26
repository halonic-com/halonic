# Decision: the fast-track signal rule counts no approval in a snapshot without reviewers

- Task: HAL-19775
- Approval: HAL-19775, from Liam's review of #6566 (HAL-19653), which offered either the same fallback or narrower wording
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7AJBLBSrJnJwtrl0CXupArj63GU1NJ8QisHb2telq8mi8g9Ly6BTnrM7hnSANo4jbrvSyoCGaWyrBU5Az8t6Aw==

## What changes

`paperclip.snapshot-reviewer` said a snapshot saved before it named reviewers gets the author
rule's reviewer everywhere. It now says that holds for the reviewer wake and the fast-track
monitor, while the fast-track signal rule names no reviewer for such a snapshot and counts no
approval until a pass names one. One example is added for that case.

## Why

The signal rule is pure and may import nothing, so it can't call the author rule, and copying
the rule into it would start a second reviewer list, which `paperclip.reviewer-source` forbids.
The code already worked this way; only the wording claimed more. It is stricter, not looser: an
approval is never counted for a reviewer nobody named. It matters for one pass after the deploy,
until the next pass names every reviewer.

## Tests

No test was skipped, weakened or deleted. `signals/fast-track-checks.test.ts` is new and covers
the case, and `snapshot/reviewers.test.ts` gains a test that the repository's name is compared
whatever its case.

## Covers

- paperclip.snapshot-reviewer
