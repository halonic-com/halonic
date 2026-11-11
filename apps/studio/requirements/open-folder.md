# studio.open-folder

- Status: active
- Since: 0.1.0
- Source: HAL-1291 (T3 part 2), flow-workspace 2.1 and 2.2; HAL-2952 (keychain secrets, threat model 4.4)

When the desktop app starts, it shall show the Welcome screen (`shell.welcome-open`) behind the workspace feature's window (`workspace.workspace-window`), and its **Open folder** and **Open a folder…** shall show the shell's folder picker, the `pick_folder` command. When a folder opens, the app shall give the workspace services of its own, provide the OS keychain as their secrets and tokens (`provideShellSecrets`) before any feature's services are built, and name the workspace after its folder until the workspace's files can be read (HAL-3335). The app shall keep Recent in the page's `localStorage`. When the app stops, it shall dispose every open workspace's services.

## Examples

- Given the desktop app has just started,
  when the user presses **Open folder** and picks `/work/acme`,
  then the sidebar's switcher reads "acme" over "/work/acme" and Recent remembers it.
- Given the workspace in `/work/acme` is open,
  when a feature reads its secret `openai`,
  then the keychain is asked through the shell, not a file in the data folder.
