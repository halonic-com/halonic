# studio.src-tauri.crates.update-state.update-notes

- Status: draft
- Since: unreleased
- Source: HAL-19545; the board's request on HAL-19542

When a check finds an update, the shell's updater shall pass the update manifest's `notes` on with
the available and ready states, and from the manifest's `halonic.releaseNotes` the notes of every
version newer than the installed one and no newer than the offered one, by semantic version with
build metadata ignored, newest first, at most 50 versions and 100,000 characters. When the list
stops above the installed version or is cut, it shall say that older notes are on the release page.
When the manifest has no list, it shall pass on the offered version's own notes alone.

## Examples

- Given a manifest with `"notes": "- Fixed X."`,
  when a check finds it,
  then the state is available with `notes` "- Fixed X.".
- Given Halonic 0.4.1 is installed and 0.4.4 is offered with notes listed for 0.4.4 down to 0.4.0,
  when a check finds it,
  then it passes on 0.4.4, 0.4.3 and 0.4.2 in that order, and not 0.4.1.
