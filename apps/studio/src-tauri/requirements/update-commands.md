# studio.src-tauri.update-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-1206; flow-install-update section 4 (HAL-1114); the interface agreed with HAL-1295; failure path 2 (HAL-1668)

Where Halonic runs as the desktop app, the shell shall give the app's own page the updater's status through `update_status` and `update_watch`, and let it check, download, cancel, restart to update and turn automatic updates on or off through the other `update_*` commands; the served Studio shall get none of them, and no page shall get the updater plugin's own commands. A check shall give up after 15 seconds, and a download shall stop when no data arrives for 60 seconds; either failure shall change only the status and the log. With automatic updates off, the shell shall make no update request unless the page asks for a check. Before it runs an installer, the shell shall write down the version it installs and stop the agent host; "Restart to update" shall pass `/RELAUNCH` so the installer reopens Halonic, and installing when Halonic quits shall not.

## Examples

- Given the served Studio,
  when it calls `update_status`,
  then the shell refuses it as not allowed.
- Given the local Studio page,
  when it calls `plugin:updater|check`,
  then the shell refuses it as not allowed.
- Given a check that gets no answer within 15 seconds,
  when it gives up,
  then the status says it couldn't check because the update server didn't answer, and nothing else shows.
