# Decision: two clarifications to `shell.announcer`

- Requirement: `shell.announcer` (`packages/studio/shell/requirements/announcer.md`)
- Task: HAL-973, from Liam's review of #376 (HAL-1244, points 1 and 2)
- Approval: the reviewer asked for both; the maintainer (Liam) approves them in review

## What changes

The requirement grows; nothing it promised before is taken away.

- Announcements held because no regions were there are read as soon as a modal pushes its
  regions, not only when the frame mounts its own. Before, `pushModalRegions` didn't schedule a
  read, so the text waited for the next `announce`. That was a bug; a regression test now covers it.
- When a text held for window focus is asked for again without `whenWindowFocused`, it is no
  longer held. Pending announcements are keyed by text, so before this the plain request was
  held too.

## Why

Both close gaps the review found. Neither changes what an existing test expects; two new tests
in `src/announcer/announcer.test.ts` cover them.
