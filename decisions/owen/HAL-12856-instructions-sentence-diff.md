# Decision: What changed shows only the changed sentences of a text

- Requirements: `source-control.changed-words` (`packages/studio/features/source-control/requirements/changed-words.md`)
- Task: HAL-12856, from the usability re-walk on HAL-12840 (C86)
- Approval: a detail of an approved screen, so a team decision (HAL-2282); Liam approves this note in his review of this pull request on HAL-12856
- Kind: internal

## What changes

`source-control.changed-words` gains one paragraph and one example. When a part's old and new values are both text, such as an agent's instructions, What changed shows only the runs of sentences that changed, split the way the line's "N sentences changed" count splits them, each as its own `<del>` and `<ins>`. Sentences that stayed the same are left out; the whole text stays under Advanced. Inside each value, the words the other value doesn't have are in bold.

Everything the requirement said before still holds: the CHANGED, ADDED and REMOVED labels, `<del>` and `<ins>` with the hidden "Before:" and "After:", and that colour carries no meaning on its own. Values that aren't text, such as a list of connections, are shown whole as before.

## Why

A one-word edit ("Write short sentences" to "Write short, warm sentences") struck through the whole instructions and repeated them, unchanged sentences included, while the row said "1 sentence changed". With longer instructions a person had to compare whole paragraphs by eye to find one word. Bold rather than underline marks the words, because the new value sits in an `<ins>` the design already shows without an underline, and bold reads the same inside the struck-through old value.

## Covers

- source-control.changed-words
