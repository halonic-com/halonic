# Decision: a version's contents in History are its items, not its file paths

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12857 (a detail of the approved History screen, so a team decision under HAL-2282; found in the re-walk HAL-12840, C86)
- Kind: user-visible

A version's details (beside History on a desktop, its own page on a phone) list "What's in it" as
the version's items, counted as items, each with the icon, name and kind the Changes list gives it,
named by its file as it is now (by its id as a name once deleted, "Weekly report"), in place of the raw paths and a file count.
`source-control.history-page` and `source-control.changes-phone` say so. The tests that checked the
paths now check the items and that no path shows; none was weakened.

## Covers

- source-control.history-page
- source-control.changes-phone
