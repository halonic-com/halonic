# Decision: a golden file for the new `halonic routines` list

- Approval: [HAL-4844](/HAL/issues/HAL-4844) asks for "a golden `.txt` for the list like the other commands"; the maintainer (Liam) approves this note in review
- Kind: internal
- Task: HAL-4844

## What changes

The new command `halonic routines` gets its golden file, the Acme example's list in the three
modes of the design's checklist (colour, `NO_COLOR`, `--json`), as `halonic run` has its own.
It is new: no golden file, requirement or test was changed, weakened or removed.

## Covers

- apps/cli/src/commands/routines/golden/acme-routines.txt
