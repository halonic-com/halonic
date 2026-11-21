# Decision: an id must match its file name, and Did you mean for unknown agents and states

- Approval: Liam approves this change on HAL-14277 (https://paperclip.halonic.com/HAL/issues/HAL-14277), from Nina's check C337 (HAL-14257, rows 21, 27 and 28, code rows C20 and C21) and C340 (HAL-14271, row 8). A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

- **Id and file name (C20).** A file whose own `id` differs from the one its file name gives fails
  with `id-differs-from-place` at `id`: `The id is author, but the file is writer.agent.yaml. Use
  the same name in both, or leave id out.`. A hub's own `hub.yaml` names its folder instead:
  `The id is note, but the folder is hubs/notes/. Use the same name, or leave id out.`. A file
  without an `id` gets no message: it takes the name from its place, which the message offers as
  a fix. An id that fails its own format (`in process`) gets only that error.
- A file that fails this way answers to both names, so nothing else calls `writer` or `author`
  unknown. The loader passes `parseFile` where the id comes from (`idSource`).
- **Did you mean (C21).** An unknown agent of a step, a branch or a routine, and an unknown state
  of a transition, end with `. Did you mean "sorter"?` when exactly one name differs only in case,
  or else is within an edit distance of 2. An agent of another hub says
  `. reporter is in the hub reports; a workflow can only use its own hub's agents.`. Without a
  hint the old message stays as it was.
- **Unreachable states.** A transition to an unknown state counts as going to its guess when it
  looks for unreachable states, so `reveiw` no longer warns that `review` and the states after it
  can never be reached. Without a guess nothing changes, so the parity case
  `workflow/unknown-target` keeps its warning.
- One parity difference, `id-differs-from-place`, records the move for `provider/duplicate-id`:
  the copy now fails for its id, and `Duplicate id "mock"` no longer comes. The duplicate check
  stays as a guard, but the loader can no longer reach it, since two files of one kind in one hub
  can't share an id any more. The parity helper `placeIdOf` didn't strip `.collection`, which
  didn't matter while a file's own id always won; it now does.

The requirements `format.id-from-place`, `workspace.references`, `workspace.file-rules` and
`workflow.validate` say this, with the new `workflow.unknown-name-hints`. The test that a failed
agent is known only by its own id now checks both names; the duplicate-id test checks the new
error. Tests are added for each message, the hub, the routine, the branch and both reachability
cases. No test was weakened or skipped.

## Why

Renaming an agent in one place is a common edit, and today nothing points at the cause: the
workflow gets "unknown agent" twice. A hub's id that differs from its folder passed `validate`
while the run used the folder name. `Sorter` for `sorter` and one swapped letter are the most
common reference mistakes, and one typo in a `to:` gave three warnings about the wrong states.

## Covers

- format.id-from-place
- workspace.references
- workspace.file-rules
- workflow.validate
- packages/testing/parity/allowed-differences.json
