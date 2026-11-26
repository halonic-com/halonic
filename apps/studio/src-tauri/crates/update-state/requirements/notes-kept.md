# studio.src-tauri.crates.update-state.notes-kept

- Status: draft
- Since: unreleased
- Source: HAL-19364 (the "Updated to" dialog's what's new); HAL-19365 (plan review)

When the shell's updater passes on an update manifest's notes, it shall remove control characters
other than line breaks and tabs from them, and when it installs an update, it shall keep that
version's own notes in the updater record, cleaned and capped the same way again when read back, and
pass them in `justUpdated` at the first start on that version.

## Examples

- Given a manifest whose notes are `- Update button` and an escape character,
  when a check finds the update,
  then the available state's notes are `- Update button`.
- Given an install of 0.1.1 with notes,
  when Halonic starts on 0.1.1,
  then `justUpdated` carries the same notes, once.
