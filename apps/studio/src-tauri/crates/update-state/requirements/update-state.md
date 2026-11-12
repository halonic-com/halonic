# studio.src-tauri.crates.update-state.update-state

- Status: draft
- Since: 0.1.0
- Source: HAL-1206; flow-install-update 4.1, 4.3 and 4.6 (HAL-1114), U1, U3 and U7; failure path 2 (HAL-1668)

The shell's updater shall check for an update 10 seconds after the window is ready and then whenever 24 hours have passed since the last check by the wall clock, and never by itself while automatic updates are off. Just before it runs the installer, it shall write down the version it installs; at the next start, that version shall be reported once as updated, an older version shall count one failed install for that try, and a newer version shall clear the record. After two downloads of one version whose signature doesn't match, it shall not download that version again until a newer version appears. It shall never write over an updater record whose format is newer than its own, and shall keep the fields of its own format that it doesn't know.

## Examples

- Given a window that has been ready for 10 seconds and automatic updates on,
  when the updater asks whether a check is due,
  then it is, also when the last check was a minute ago in an earlier run.
- Given an install of 0.1.1 started from 0.1.0,
  when Halonic starts again on 0.1.0,
  then the updater reports that 0.1.1 didn't install, with one attempt, and a second start without a new try doesn't count another.
- Given two bad signatures for 0.1.1,
  when 0.1.1 is offered again,
  then it isn't downloaded; when 0.1.2 is offered, it is.
- Given a record with format 2,
  when the updater reads it,
  then it uses its defaults and doesn't write the file.
