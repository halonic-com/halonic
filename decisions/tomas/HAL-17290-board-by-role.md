# Decision: refer to the board by role in one more decision note

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16851 (approved by the board on 23 Nov; this pull request is HAL-17290)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:lMVUrWwa0hw6G6lqtzzZJVN8nHODAB4gI52b8C6MjmNx2jeOdILMd7YQudBCvbb03PMpSgchnNgIzgBJbfkaAg==

The repo is public, and the board asked for a board member's name to go from
its files (HAL-16851, done for the rest in HAL-16852). One decision note was
added to `main` after that cleanup and still names the board member, and the
leak guard's new deny terms now fail every merge group on that line.

**What changes.** Only wording. One line of the note below says "the board"
in place of the name; its date, task and decision stay as they were.

Nothing is weakened: no requirement, test or check changes. Old commits keep
the old text; history isn't rewritten (HAL-51).

## Covers

- decisions/tomas/HAL-16850-julian-scope-nested-fields.md
