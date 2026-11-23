# cli.plugin-record-unreadable

- Status: active
- Since: unreleased
- Source: HAL-15893, from flow check C646 on HAL-15887; the words and fixes of the plugins folder (`cli.plugins-folder-unreadable`, HAL-15785) and of a damaged secrets file, for the files that keep every plugin's source and settings, decided by the team under HAL-2282

When a file in the profile's `plugin-records` folder, or that folder itself, can't be opened by the person running Halonic (the file system refuses it with `EACCES` or `EPERM`), every `halonic` command that reads or writes the plugin records, such as `halonic plugin list` and `halonic plugin remove`, shall refuse with a `denied` error (exit 7) that names it, "The plugin record file <file> can't be read by you." or "The plugin records folder <folder> can't be read by you.", and a fix, instead of asking for a bug report. On Linux and macOS the fix shall be "Run chmod 600 <file>, then run again." for a file and "Run chmod 700 <folder>, then run again." for the folder when the person owns it, and `sudo chown` back to the person followed by the same `chmod` when another user owns it, with the path written for a shell; on Windows it shall be to give the person's account access in its Properties. When a record file holds something other than whole records, such as a line that isn't JSON, those commands shall refuse with an `unavailable` error (exit 9), "The plugin record file <file> is damaged at line <n>: <why>", and the fix "Delete line <n> from it, or delete the file, then run again.", followed by what deleting the file forgets for every plugin: where each was added from, or its settings. The store's error shall stay the refusal's cause, for `--debug`. Once the file is fixed or deleted, `halonic plugin remove` shall remove the plugin.

## Examples

- Given a plugin added from a folder, and a line "not a record" added to the record file that keeps where it came from,
  when `halonic plugin list` or `halonic plugin remove weather --yes` runs,
  then it prints "✕ Couldn't list the plugins: the plugin record file <file> is damaged at line 2: it is not JSON." (or "Couldn't remove the plugin") and "Delete line 2 from it, or delete the file, then run again. Deleting the file forgets where each plugin was added from; the plugins stay.", and exits with 9.
- Given that file deleted,
  when `halonic plugin remove weather --yes` runs,
  then the plugin is removed and it exits with 0.
- Given a record file with mode `000` that the person owns,
  then the refusal is "The plugin record file <file> can't be read by you." with "Run chmod 600 <file>, then run again.", and exit 7.
- Given the `plugin-records` folder with mode `000`,
  then the refusal names the folder, with "Run chmod 700 <folder>, then run again."
