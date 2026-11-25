# Decision: the person chooses the update track, and a Preview build follows Preview by default

- Approval: Chief's team decision on HAL-18474 and HAL-18480 (a saved choice wins; with none saved, a Preview build follows Preview and a stable build Stable), and the board's approval of the Update track setting on HAL-18478; Liam approves and signs this note in review
- Kind: user-visible

## What changes

`studio.src-tauri.update-track` said a missing `track` in the updater's record counts as `stable`.
It now says the install follows the person's choice, saved as `chosenTrack` by the new
`update_set_track` command, and with no choice a `<version>-preview.<n>` build follows Preview.
The old `track` key is no longer read: every build since #6072 wrote `"track": "stable"` on start,
so it can't tell a choice from the old default. Changing the track drops an update the other track
found or downloaded, since it is signed with the other track's key.

`studio.src-tauri.served-page` adds `update_set_track` to the commands the local page may call;
the served Studio still gets none.

The three tests in `track_tests.rs` that checked the old rule (`update_track_is_stable_when_nothing_chose_one`,
`update_track_preview_is_kept_in_the_record`, `update_track_unknown_or_broken_value_is_stable_and_keeps_the_rest_of_the_record`)
are replaced by tests of the new one.

## Why

Without it a Preview build with nothing saved updates on Stable, and About Halonic's "Update track"
setting (HAL-18656) has nothing to save its choice with.

## Tests

`apps/studio/src-tauri/crates/update-state/src/track_tests.rs` (`update_track_*`) and
`apps/studio/src-tauri/src/served_page_tests.rs`.

## Covers

- studio.src-tauri.update-track
- studio.src-tauri.served-page
- apps/studio/src-tauri/crates/update-state/src/track_tests.rs
