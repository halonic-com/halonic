# Decision: the review records live in the profile, and the store that hid them goes

- Requirements: `app.review-record` (`packages/core/app/requirements/review-record.md`),
  `app.review-hidden` (removed), `profile.workspace-folders`
  (`packages/core/profile/requirements/workspace-folders.md`)
- Task: HAL-3277; the decision is on HAL-3417
- Approval: decided on HAL-3417 (technical choice, within the team); Liam approves it in review
- Kind: internal

## What changes

- `app.review-record`: the records are kept in a store of their own, rooted at the workspace's
  review folder in the profile, not in `.halonic/review/files/` inside the workspace. The
  examples say where, and that a file not named like a record is left alone.
- `app.review-hidden` is removed, with `ReviewingDefinitionStore`. It only existed to hide
  `.halonic/review/` from the rest of the app and to keep the records out of `version()`. With
  no records in the workspace there is nothing to hide, and the workspace store's own version
  is right again.
- `profile.workspace-folders` gains one folder, `review`, beside `records`, and one example.
  `workspaceFolders(...)` gets `reviewFolder()`.

## Why

A record's baseline decides what Try it and Test leave out: permissions, trust and sandbox,
connections, models. Inside the workspace, git could bring a record in (a shared repository could
ship one that grants more than the file shows), and `commitVersion`, `status`, snapshots and Share
would carry them, because git doesn't go through the store that hid them. The trust records live
in the profile for the same reason. Nothing uses the records yet (the review service is PR 2), so
no workspace has any to move.

The decision on HAL-3417 named `<profile>/review/<workspace hash>/`. Since then HAL-3298 gave each
workspace one folder in the profile for its runs, blobs and records, so the review records go there
too, as `review`: one key, one place to look, and a moved workspace loses them as it loses its runs.

## Tests

No test was weakened. The `ReviewingDefinitionStore` tests are removed with it. The record tests
now check the record's name at the root of its store, and that a file in a sub-folder is left
alone. One test was added for the review folder, on Linux and Windows.

## Covers

- app.review-hidden
- app.review-record
- profile.workspace-folders
