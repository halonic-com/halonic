# Decision: decision notes already on the base branch are append-only

- Approval: HAL-9693, follow-up of the review of halonic#2770 (HAL-9689), under the board's design for guarded trust roots (HAL-1337)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:NzYiGZak1PoAnCa0rjvuqcwNb8VYKU3ZfFhRl2YIHwwNN8IpDohQPl0NO+wRZNHJZE9F7nGdnCvrB4KWKw0gDw==

The note check never read a decision note that is already on the base branch, so a pull request could quietly rewrite the record of what was approved, such as its Approval or Covers lines. The note check now fails any edit or deletion of such a note, other than the branch's own. A real case (a typo fix) needs a `user-visible` note of its own that lists the edited note's path under Covers and is signed like any other. This changes the note check, a trust root, so two guardians sign. A new requirement, a test and a paragraph in `docs/guides/checks.md` come with it.

## Covers

- tooling/check/
- check.guard-notes-append-only
- check.guard-notes-own-paths
