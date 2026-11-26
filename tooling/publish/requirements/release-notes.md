# publish.release-notes

- Status: active
- Since: unreleased
- Source: HAL-19542 (the board: no change notes in the desktop update dialog or the GitHub releases)

When the release workflow builds a stable release, it shall take that version's section of
`apps/studio/CHANGELOG.md` as the release notes, without the kind headings and commit hashes
changesets adds, and shall fail when the changelog has no section for the version. When the preview
workflow builds a preview, it shall take the app's changesets merged since the newest stable release,
newest first. Notes longer than 20,000 characters shall be cut at the start of an entry, ending with a
line that counts the entries left out. The notes shall be the text of `notes` in latest.json and shall
be in the GitHub release's description.

## Examples

- Given a changelog with "## 0.1.1" holding "- 9800bc3: Accepting a run's changes never writes into Halonic's data folder.",
  when the notes of 0.1.1 are taken,
  then they read "- Accepting a run's changes never writes into Halonic's data folder."
- Given a changelog without "## 0.1.2",
  when the notes of 0.1.2 are taken,
  then there are none, and the release fails.
- Given changesets naming `@halonicjs/app-studio` and one naming only another package,
  when the preview notes are taken,
  then they list the app's changes, newest first, and leave the other one out.
- Given notes of 25 entries of 1,000 characters,
  when they are cut,
  then they keep the first 19 and end with "And 6 more changes."
