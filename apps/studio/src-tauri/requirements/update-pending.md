# studio.src-tauri.update-pending

- Status: draft
- Since: unreleased
- Source: HAL-19635 (the board's request on HAL-10); plan approved on HAL-19635

Where Halonic runs as the desktop app and no other tool updates it, the shell shall keep a downloaded update whose signature matches in `<profile>/updates/pending/`, as `Halonic-<version>.update` with the check's answer and the track beside it in `Halonic-<version>.json`, writing the installer first and the record second, each through a `.tmp` file and a rename, and shall not hold it in memory. At start, it shall make that update ready again without downloading it only when the record's track is the install's track, the updater takes the record's answer as newer than the running version, and the installer verifies against that track's key with the signature naming that same version; it shall remove every other file in the pending folder, a file without its partner and a `.tmp` file included. When a check finds a version newer than the ready one, the shell shall download it while the ready one stays ready, and once the newer one is verified and written, it shall remove the older pair; if the newer one fails, the ready one shall stay ready. The pending folder shall hold at most one update, so with the kept installer of the running version, `updates/installers/` and `updates/pending/` hold at most two installers after a start that proved itself. Before it installs, the shell shall verify the installer's bytes again and remove a pending update that no longer verifies. When `update_set_track` changes the track, the pending folder shall be emptied. The log shall name a pending file relative to the profile, never by its full path.

## Examples

- Given Halonic 0.1.1 downloaded 0.1.2 and quit without installing it,
  when it starts again,
  then 0.1.2 is ready, the log says "reusing the pending download 0.1.2", and nothing is downloaded.
- Given 0.1.2 ready and a check that finds 0.1.3,
  when 0.1.3 has downloaded and its signature matches,
  then the log says "replaced pending 0.1.2 with 0.1.3" and `updates/pending/` holds only 0.1.3's two files.
- Given a pending installer with one byte changed, or one signed with the other track's key,
  when Halonic starts,
  then it isn't reused and the pending folder is emptied.
- Given a pending record that names 0.1.3 beside an installer signed for 0.1.2,
  when Halonic starts,
  then it isn't reused, since the signature names another version.
