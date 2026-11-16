# source-control.get-updates-per-item

- Status: active
- Since: 0.1.0
- Source: HAL-10718 (T9 PR 7c); ux-checklists-t8-t9 (HAL-1360) part 2, 2.8; `docs/adr/2026-11-16-git-guard-merges-only-with-the-ours-strategy.md`

When both this workspace and the shared copy have versions the other lacks, the workspace's history shall start combining them with `merge -s ours`, so that no file changes and no conflict marker is written, and shall then bring in, as the shared copy has them, the files only the shared copy changed. It shall list the items both sides changed and now hold differently, sorted, leaving Halonic's own folders out. For each item the person shall choose Keep mine (nothing changes), Use theirs (the file becomes the shared copy's text, or is deleted where the shared copy deleted it) or Keep both (this side's file stays and the shared copy's text is saved beside it as `name (label).ext`, or `name (label 2).ext` when that is taken); Keep both is refused for an item one side deleted. A choice shall be taken back with Undo, which puts the file as it was. Finishing shall refuse until every item is chosen, then record the combined result as one version with both histories as parents. Cancelling shall put every file back as it was before and keep changes that were not in a version. A merge left half done shall stay open, with its choices, after the window closes, and shall be read again as it was left. Starting shall refuse, changing nothing, when a file the shared copy changed also has changes that are not in a version, and when the shared copy can't be reached.

## Examples

- Given both sides changed `a.md` differently and the shared copy alone changed `b.md`,
  when the merge starts,
  then `b.md` is the shared copy's, `a.md` is untouched and is the only item.
- Given the item `a.md` and the choice Use theirs,
  when the person undoes it,
  then `a.md` is this side's text again and the item is not chosen.
- Given the choice Keep both for `notes.md` with the label "Sam's",
  when it is made,
  then `notes.md` is unchanged and `notes (Sam's).md` holds the shared copy's text.
- Given one item is not chosen, when the person finishes, then it is refused and the merge stays open.
- Given every item is chosen, when the person finishes, then the version has two parents and holds each item as chosen.
- Given the person cancels, then the files are as before the merge started and the merge is gone.
- Given the window closed after one choice, then reading the merge gives that choice again.
- Given `a.md` has changes not in a version and the shared copy changed it too, then starting is refused and nothing changes.
