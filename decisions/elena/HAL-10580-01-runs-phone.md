# Decision: the phone shows the Runs list, not a sentence

- Task: HAL-10580
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-9387 (Liam's call: the phone layout comes after 0.1.0, and 0.1.0 is tagged); the layout is checklist 1.14 (HAL-1360, revision 10), already approved; Liam signs this note
- Kind: user-visible

## What changes

`runs.list` loses the paragraph "On a phone, the Runs list shall show only the sentence 'Runs open on your computer for now.'" and gains one that describes the phone layout of checklist 1.14: the same page, the heading for screen readers only, the status chips on one row and Test runs on the next, and each run as three lines with no chevron and no ⋮.

The test "shows only the sentence on a phone" for the list is replaced by tests of that layout. The run page keeps its sentence until the next pull request (HAL-10580, part 2).

## Why

HAL-9387 put the phone layout after 0.1.0 and kept the single-column design for that round. 0.1.0 is tagged, so the phone gets the list. The Search and the hub picker of 1.14 wait for the desktop's text and hub filters, which don't exist yet.

## Covers

- runs.list
- packages/studio/features/runs/src/ui/runs-on-computer.test.tsx
