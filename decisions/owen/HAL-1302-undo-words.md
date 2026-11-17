# Decision: Undo these changes says "Undid changes to <name>.", asks one question when no copy can be kept, and ignores a second press while it runs

- Task: HAL-1302 (T9, per-item undo)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1360 (the T9 UX checklist, part 2, 2.5: the toast words, 10 s with Undo, and the dialog when the copy can't be written; a team decision on top of the approved screen, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XpzEHkEsSLhJGCQbTpVCI8P9178GqeimJzo9K7lBdq+QMoRbCvuIosCDFvtumV+1l/IOgp2q/rGZoxbUlu+4BA==

## What changes

The toast after Undo these changes reads "Undid changes to <name>." with **Undo** (it was "Discarded <name>" with "Put it back"). The toast already stays 10 seconds and pauses on hover and focus in the kit; a test now pins it. When Halonic can't keep a copy, nothing is changed and one dialog asks "Undo changes to <name>?" with "Halonic couldn't keep a copy, so this can't be undone.", Cancel focused and **Undo changes** in danger red; going on shows a toast with no Undo. A second Undo these changes (for example from the ⋮ menu) is ignored while one runs.

The requirement `source-control.discard` changes the sentences about the copy and the toast and gains two examples. Nothing was removed or skipped. The developer view's per-file Discard keeps its inline failure text. New tests cover the question, Cancel, going on without a copy and the busy guard.

## Why

The checklist asks for these words and this one question. Left for later: the partial-result Callout (audit item 4).

## Covers

- source-control.discard
