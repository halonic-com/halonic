# Decision: Library words and flow follow the approved microcopy

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11613#document-ux-check (rows L1, L2, L4 to L7, L9 to L11, built on HAL-11625). The words are the approved microcopy; a team decision with no board card (HAL-2282 rule).
- Kind: user-visible

Library pages say what the approved microcopy says. A failed save of a skill or knowledge source shows in the
status bar and as a toast ("Couldn't save *name*: *reason*." with **Try again**), not as a box on the page. The
item-page trash strip is "This skill was moved to the trash" with no name, and Undo announces nothing. Load
failures read "Couldn't load this skill" and name their item for knowledge. Summarize uses the window's own
"isn't answering" words. The phone's empty Knowledge sentence drops the desktop sentence, and phone kind rows show
counts. A connector page shows the 11.4 Tools words with a quiet link to its file. Requirements are edited to the
same words; no test was weakened or skipped, and the tests that named the old words name the new ones.

## Covers

- library.skill-page
- library.knowledge-page
- library.knowledge-summarize
- library.library-delete
- library.library-open-as-file
- library.library-phone-kinds
