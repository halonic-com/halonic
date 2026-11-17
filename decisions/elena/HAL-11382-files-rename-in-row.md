# Decision: Rename edits the file's name in its tree row

- Task: HAL-11382
- Approval: Liam approves this note in review on the review task for HAL-11382 (team decision under the HAL-2282 rule: it builds on the approved Files flow, checklist 8.11)
- Kind: user-visible

## What changes

The requirement `files.ui.rename-file` no longer opens a "Rename file" dialog. F2 edits the name in
its tree row: Enter or leaving the row applies it, Escape puts the old name back. The toast "Renamed
to *path*" gets **Undo**, and a second line names the places in other files that also changed. The
renamed row gets focus, and the file opens at its new path only when it was the open one.

## Why

The design check (HAL-11370, F2) found that the dialog broke checklist 8.11 and that the toast had
no Undo (microcopy 7). The sentence "That is the file's own path." is not in the microcopy, so it is
gone: a name left as it was changes nothing. Two small sentences are new and are the team's call:
"A name can't contain a slash." and "Also updated *n* places: *names*." (the second names the places
as microcopy 19.7 asks; the link to the full list is not built yet).

Sofia decided the wording on HAL-11399: "slash" is spelled out because a lone `/` before a full stop
reads like a stray path fragment, and it matches the other full-sentence refusals. "Also updated" stays
as written. When the second line shows, the title ends with a full stop ("Renamed to *path*."), as the
delete toast does; without it, no full stop. At most three names show, then "and *n* more".

## Tests

No test was weakened or skipped. The dialog's tests were replaced by tests of the row and of the
rename with Undo.

## Covers

- files.ui.rename-file
