# Decision: refuse variation selectors in the server-session brief

- Task: HAL-18014
- Approval: Liam asks for this change on HAL-18014 (https://paperclip.halonic.com/HAL/issues/HAL-18014#comment-1283e8b7-db91-4e5a-8e74-76ab2a847081), from his approval of #5804.
- Kind: internal

## What changes

The shared cases in `server-session-cases.json` gain five characters under
`characters.refused`: U+FE00, U+FE0E, U+FE0F, U+E0100 and U+E01EF, the ends
and the common middle of the two variation-selector ranges. The page's
`isPlainLine` and the shell's `is_hidden` now refuse both ranges. No case is
removed or changed, and no test is weakened or skipped: the shared-case tests
on both sides run five more cases.

## Why

Variation selectors are `Mn`, not `Cf`, so the hidden-character check let them
through. They draw nothing themselves, and a run of them after an emoji can
carry hidden bytes, so the person could read one brief while Claude Code reads
another. The "Run with Claude" button isn't on yet (PR C, HAL-17844), so no
user sees a change.

## Covers

- packages/core/action-steppers/src/golden/server-session-cases.json
