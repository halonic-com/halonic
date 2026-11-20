# source-control.get-updates-per-item

- Status: active
- Since: unreleased
- Source: HAL-10718 (T9 PR 7c); HAL-13042 (nothing to choose); HAL-13528 (their items aren't your changes); ux-checklists-t8-t9 (HAL-1360) part 2, 2.8; `docs/adr/2026-11-16-git-guard-merges-only-with-the-ours-strategy.md`

When both this workspace and the shared copy have versions the other lacks, the workspace's history shall start combining them with `merge -s ours`, so that no file changes and no conflict marker is written, and shall then bring in, as the shared copy has them, the files only the shared copy changed. It shall list the items both sides changed and now hold differently, sorted, leaving Halonic's own folders out. For each item the person shall choose Keep mine (nothing changes), Use theirs (the file becomes the shared copy's text, or is deleted where the shared copy deleted it) or Keep both (this side's file stays and the shared copy's text is saved beside it as `name (label).ext`, or `name (label 2).ext` when that is taken); Keep both is refused for an item one side deleted. A choice shall be taken back with Undo, which puts the file as it was. Finishing shall refuse until every item is chosen, then record the combined result as one version with both histories as parents. Cancelling shall put every file back as it was before and keep changes that were not in a version. A merge left half done shall stay open, with its choices, after the window closes, and shall be read again as it was left. On the Changes page, Get updates shall start the merge when both sides have new versions, and open, in place of the toast, "You and Sam both changed 2 items. Choose which one to keep. Your version is kept in History either way." ("the team" and "Use the shared one" when more than one person's versions came), or, when no item changed on both sides, "You and Sam changed different items, so there's nothing to choose. Finish getting updates to bring theirs in.", with, for each item, the changed lines and the tiles Keep mine, Use Sam's and, where both sides still have the item, Keep both, none of them chosen to begin with. The chosen tile shall show "Keeping yours" (or "Keeping Sam's", "Keeping both") with Undo and take focus; the others shall fold to "Sam's: not used"; Undo shall bring them back with focus on the button used. Finish getting updates shall stay unavailable until every item is chosen, with "Choose for 1 more item." as its visible description, and then record the version as "Merged Sam's updates"; Cancel getting updates shall leave everything as it was. A merge found left open shall show "You're in the middle of getting Sam's updates." with Continue, which brings the choices back as they were left. While a merge is started, the files it brought in because only the shared copy changed them shall not be read as changes since the last version, so the Changes list and the sidebar's count leave them out until they are edited again; they come in with Finish getting updates. While a merge is started, Create version, Get updates and Undo these changes shall be unavailable with "Finish getting updates first." as their visible reason. Starting shall refuse, changing nothing, when a file the shared copy changed also has changes that are not in a version, and when the shared copy can't be reached.

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
- Given both sides changed 2 items, when the person presses Get updates, then the choices open with Keep mine and Use Sam's for each and nothing chosen.
- Given only the shared copy changed `README.md` and only this side changed `shipping.md`, when the person presses Get updates, then the page says "You and Sam changed different items, so there's nothing to choose. Finish getting updates to bring theirs in." and Finish getting updates is available.
- Given 2 items and one chosen, then Finish getting updates is unavailable and says "Choose for 1 more item.".
- Given a merge left open, then the page says "You're in the middle of getting Sam's updates." with Continue, and Create version is unavailable with "Finish getting updates first.".
- Given the shared copy alone changed `b.md` and this side has the unsaved new file `local.md`, when the merge starts, then the changes since the last version are `local.md` only.
