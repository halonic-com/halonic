# publish.release-notes-history

- Status: active
- Since: unreleased
- Source: HAL-19542 (the board: the update dialog shows the notes of every version from the one installed up to the one offered, newest first)

The release and preview workflows shall write into latest.json, as `halonic.releaseNotes`, the notes of
the version they publish and of the versions before it, newest first, each as `{ version, notes }`, so
that an install that skipped versions can show the notes of every version after its own. For a
release they shall take each version's section of `apps/studio/CHANGELOG.md` from the released version
down; for a preview build they shall put the build's own notes, the app's changesets since the previous
preview build's commit (`halonic.source`), before the previous build's list, leaving out entries that
aren't a version and its notes and repeats of a version. The list shall keep the newest versions that
fit in 100,000 characters and 50 versions, and always the newest.

## Examples

- Given a changelog with sections 0.4.4, 0.4.3, 0.4.2 and 0.4.1,
  when the release of 0.4.4 writes its list,
  then it holds the notes of 0.4.4, 0.4.3, 0.4.2 and 0.4.1 in that order, so an install of 0.4.1 can show those of 0.4.2, 0.4.3 and 0.4.4.
- Given the previous preview build's list of builds 11 and 9,
  when build 12 writes its list,
  then it holds 12, 11 and 9 in that order.
- Given two versions of 50,000 characters each and a third, older one,
  when the list is cut,
  then it keeps the two newest.
