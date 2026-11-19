# studio.src-tauri.update-commands

- Status: draft
- Since: unreleased
- Source: HAL-1206; HAL-1452 (managed installs); flow-install-update section 4 (HAL-1114); the interface agreed with HAL-1295; failure path 2 (HAL-1668); HAL-12966 (proxy)

Where Halonic runs as the desktop app, the shell shall give the app's own page the updater's status through `update_status` and `update_watch`, and let it check, download, cancel, restart to update and turn automatic updates on or off through the other `update_*` commands; the served Studio shall get none of them, and no page shall get the updater plugin's own commands. A check shall give up after 15 seconds, and a download shall stop when no data arrives for 60 seconds; either failure shall change only the status and the log. With automatic updates off, the shell shall make no update request unless the page asks for a check. Before it runs an installer, the shell shall write down the version it installs and stop the agent host; "Restart to update" shall pass `/RELAUNCH` so the installer reopens Halonic, and installing when Halonic quits shall not. The check and the download shall follow the proxy setting `http_fetch` reads at start, by the same rules: a host on `NO_PROXY` goes direct, any other `https` host through a CONNECT tunnel to the proxy, every redirect hop is decided again, a public plain `http` hop is refused, and an unusable setting fails the check before anything is sent; nothing that should use the proxy is ever sent direct, and no other proxy variable is read.

Where another tool keeps Halonic up to date (a `managed-by-scoop` file next to `Halonic.exe`, or an install path under `\scoop\apps\`), the shell shall download and install nothing, refuse "Restart to update", never ask the update feed, and send the page `managed` with the command to run (`scoop update halonic`); its only request is the version in our Scoop bucket's manifest, once a day and only while the switch **Tell me when a new Halonic is out** is on. For a managed install the page shows that switch as **Tell me when a new Halonic is out**. Without the marker and the path, nothing changes.

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
- Given `HTTPS_PROXY` set to a usable `http://` proxy,
  when a check starts,
  then the shell asks the proxy for a tunnel to the release page's name, with the proxy's user name and password on the CONNECT line only.
- Given `HTTPS_PROXY` set to a `socks5://` proxy,
  when a check starts,
  then nothing is sent, and the status says it couldn't check.
- Given a Scoop install and a bucket that offers 0.1.1 while 0.1.0 runs,
  when the check ends,
  then the status is `available` with `managed` set, nothing is downloaded, and `update_restart` is refused.
- Given a Scoop install and a bucket nobody can reach,
  when the check ends,
  then the status says it couldn't check, and nothing else shows.
