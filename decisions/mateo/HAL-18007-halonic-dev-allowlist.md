# Decision: a fast-track label added as halonic-dev counts only on the board's list

- Approval: the board narrowed the `halonic-dev` label rule on 24 Nov (the HAL-16003 scope note, the board's OK on HAL-10 at 22:04 UTC); the work is HAL-18007, and Liam reviews it and signs this note as the CTO
- Kind: internal

Every agent pushes and labels as `halonic-dev`, so a `fast-track` label
added through it says little about who asked for it. The board narrowed it
after #5725: such a label counts (for a jump) only on the pull requests of
child tasks of HAL-17422 (apps phase 1) and on #5659 and #5674 (approvals
stream PR 1 and 1b). Everywhere else it is a `wrong_label`, queued without a
jump. Still log only.

- **The list is a setting**, `fastTrackSharedLabelScope`: task identifiers
  whose child tasks count, and pull requests as `owner/name#123`. Unset, it
  is the board's list above; an empty list lets the label count nowhere. The
  board extends it without a code change.
- **Child tasks** are found each pass: one Paperclip task read per listed
  task and per pull request whose label was added as `halonic-dev` (its task
  from the branch name, own repository only). A failed read skips that
  pass's fast-track rules, as any other failure there does, so the next pass
  tries again.
- **Unchanged:** the board's login from `fastTrackLabelAdder` counts on
  every pull request; an adder GitHub doesn't give never counts; `bot_label`
  stays.

Requirement and test changes:

- `paperclip.fast-track-rules`: the text says a label added as `halonic-dev`
  counts only on the pull requests in that setting. The label example now
  flags `halonic-dev`'s label outside the list and doesn't flag it on a
  listed task's child or a listed pull request.
- In `src/fast-track/rules.test.ts`: "counts a label added as halonic-dev,
  with or without the board's login set" now puts the pull request on a
  child of a listed task (its branch names HAL-501), since on any other pull
  request the label is flagged.

## Covers

- paperclip.fast-track-rules
- tooling/paperclip/src/fast-track/rules.test.ts
