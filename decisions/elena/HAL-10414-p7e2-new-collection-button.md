# Decision: the Library's New button also opens New collection

- Task: HAL-10414
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10743 (Liam's review of #3081; a team decision with no board card, HAL-2282 rule: it builds on the approved flow-library 5.3 and the New collection dialog)
- Kind: user-visible

## What changes

The requirement `library.library-place` gains one rule: on the Skills and Collections tabs the New
button opens that tab's New dialog, and the new skill's or collection's page opens once it is
made. One example is added (a collection "Claims" opens `collection/~workspace/claims`).

Nothing existing is removed or weakened. No test is changed, skipped or deleted; tests for the
button, the focus and the opened page are added.

## Why

The New collection dialog (#2979) and its host (#3068) had no button that opened them.

## Covers

- library.library-place
