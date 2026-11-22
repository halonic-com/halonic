# cli.plugins-folder-unreadable

- Status: active
- Since: unreleased
- Source: HAL-15785, from flow check C630 #1 on HAL-15782; the words and fixes of the secrets file a person can't read (`secrets-file.unreadable`, HAL-15511), for the folder that holds every plugin, decided by the team under HAL-2282

When the person running Halonic may not list the profile's plugins folder itself (the file system refuses it with `EACCES` or `EPERM`), every `halonic` command that reads the plugins, such as `halonic plugin list`, shall refuse with a `denied` error (exit 7) that names the folder, "The plugins folder <folder> can't be read by your user account.", and a fix, instead of asking for a bug report. On Linux and macOS the fix shall be "Run chmod 700 <folder>, then run again." when the person owns the folder, and `sudo chown` back to the person followed by `chmod 700 <folder>` when another user owns it, with the folder written for a shell; on Windows it shall be to give the person's account access in the folder's Properties. The file system's error shall stay the refusal's cause, for `--debug`. A plugin's own folder that can't be read shall stay a plugin that can't be read or checked, and the others shall still be listed. `halonic doctor` shall, for the same folder, show the Plugins line marked with ! as "The plugins folder <folder> can't be read, so <plugins> is off.", naming each plugin the workspace's connectors use once, with the same fix ending "then run halonic doctor again.", and still exit with 0; with `--json`, the problem shall be `folder-unreadable` with the folder, the plugins and who can fix it (`access`).

## Examples

- Given a plugins folder with mode `000` that the person owns,
  when `halonic plugin list` runs,
  then it prints "✕ Couldn't list the plugins: the plugins folder <folder> can't be read by your user account." and "Run chmod 700 <folder>, then run again.", and exits with 7.
- Given the same folder and the agent Helper uses the connector `orders`, which names the plugin `weather`,
  when `halonic doctor` runs,
  then it prints "! Plugins     The plugins folder <folder> can't be read, so weather is off." with "Fix: run chmod 700 <folder>, then run halonic doctor again." under it, and exits with 0.
- Given a plugins folder owned by another user,
  then the fix is `It belongs to another user: run sudo chown "$(id -un)" <folder>, then chmod 700 <folder>, then run again.`
- Given a plugin's own folder that can't be read,
  then `halonic plugin list` lists it as "✕ can't be read or checked" and lists the others.
