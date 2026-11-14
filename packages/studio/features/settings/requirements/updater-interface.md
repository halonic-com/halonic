# settings.updater-interface

- Status: active
- Since: 0.1.0
- Source: HAL-1295; flow-install-update 4.2, 4.3 (HAL-1114); failure path 2 (HAL-1668); update-commands (`apps/studio/src-tauri`)

Where Halonic runs as the desktop app, Settings shall read the updater through one `UpdaterHost` service: the status (the version that runs, the automatic switch, whether a check runs, when one last answered, the update this start finished, whether another tool manages updates, and the state), a way to follow it, and the actions Check now, Download, Cancel download, Restart to update and the automatic switch. The status shall carry a download's `done` and `total` from its first byte, with `total` empty when the server doesn't say, and shall carry a reason, never raw error text, for a check or a download that couldn't finish. A progress bar shall show the fraction done only when the total is known, and never more than the whole.

## Examples

- Given a download of 12 of 48 MB,
  when the bar asks for the fraction,
  then it gets 0.25.
- Given a download that has sent its first bytes and the server gave no total,
  when the bar asks for the fraction,
  then it gets none, and the line shows only how much has arrived.
- Given a status whose state is `cant-check` with the reason `offline`,
  when About Halonic words it,
  then it has a reason to translate and no error text.
- Given the desktop app, two listeners following the updater and a third that has stopped,
  when the shell reports a change,
  then the two hear it, the third does not, and the shell was asked to watch once.
