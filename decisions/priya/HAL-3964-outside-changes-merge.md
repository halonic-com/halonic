# Decision: a change made outside Halonic moves the baseline when it doesn't touch the assistant's

- Requirements: `app.review-outside-changes-merge` (new,
  `packages/core/app/requirements/review-outside-changes-merge.md`), `app.review-other-writes-merge`,
  `app.review-on-open`, `app.review-assistant-writes`, `app.review-record`
- Task: HAL-3964; the decision is on [HAL-4030](/HAL/issues/HAL-4030)
- Approval: Liam decided on HAL-4030, "option 1 as written" with three additions (technical
  choice, within the team; no board card, because Compare and the held state are already
  approved); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:41e+JIk6DTe/P1yKshr+hoqF1+0V1H/hZ/YXVKfhniyT/+xKUIy4nTEY2T/N2dakBisyare2H3HzU4fOPPddDw==

## What changes

- New `app.review-outside-changes-merge`: when the file of a record changed outside Halonic since
  it was last seen, found by a watch batch, on opening the workspace or before a write (a person's
  or the assistant's), the baseline moves by a three-way merge with the file as last seen as base,
  the baseline as ours and the file now as theirs, but only when the merge has no conflict and the
  file exists both as last seen and now. Otherwise the record stays and the file stays held for
  Compare, as today. The record keeps its card and marks; a merge that leaves nothing to review
  removes the record, as an Accept or Reject does.
- `app.review-other-writes-merge`: "the record shall stay as it is and the file shall stay held"
  becomes "the review service shall first catch up". Its example of an outside change to line 9
  now has the outside change on line 3, so it still shows a held file. The line 9 case moved to
  the new requirement, where both lines now go into the baseline.
- `app.review-on-open` and `app.review-assistant-writes`: a file that isn't as last seen is caught
  up first and held only when that can't be done. Their held examples now say the outside change
  was to the assistant's line.
- `app.review-record`: the record also keeps the file's text as last seen, left out for a file
  that is gone. It is optional, so the format stays 1 and an older record reads as before.

## Why

Until now an outside edit counted as part of the assistant's change until the person went through
Compare, so a file edited in VS Code while a card was open got stuck behind Compare, even when the
edits were far apart. The record only kept the digest of the file as last seen, so there was no
base to merge from: rebuilding it from the baseline doesn't work, because every save and every
part decision moves both. So the record keeps the text.

A person's save takes theirs on a conflict, because typing inside the assistant's change is a
decision on it. A `git pull`, a formatter or a sync tool decides nothing, so taking theirs there
would quietly accept the assistant's change without anyone looking. That is why only a clean merge
is taken in, and a whole file created or deleted outside Halonic stays held. A file the assistant
created is all its change, so any outside change to it stays held too. Changes on the line next to
the assistant's are taken in (`touchingConflicts: false`): there is one way to put them together,
and the assistant's line stays to review.

## Tests

No test was weakened. Two examples changed as described above, and their tests with them: the
outside change is now to the assistant's line, so the file is still held. Tests that read a whole
record now expect the kept text. New tests cover every example of the new requirement, a change on
the next line, a file the assistant created, kept text that doesn't match the digest, and the
assistant's write when the outside change touches its line.

## Covers

- app.review-outside-changes-merge
- app.review-other-writes-merge
- app.review-on-open
- app.review-assistant-writes
- app.review-record
