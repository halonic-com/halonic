# shell.focused-apps

- Status: active
- Since: unreleased
- Source: HAL-17915; board direction HAL-17358 (focused apps, and their frame approved 24 Nov); the windows in `studio.src-tauri.focused-apps`

The shell shall let a feature add a focused app only through the point `focusedApps.add`, naming one of the apps Halonic starts in a window of its own: `inbox`, `messenger` or `ask` (quick ask's box). If a feature adds any other app, or two features add the same one, the shell shall throw a `ShellError` that names the feature.

A focused app's window shall show only that app's view, given its feature's context for the open workspace, on the approved frame (slate-75, #f4f7fa, halfway between slate-50 and slate-100, in light; slate-950 in dark). The app either draws in the frame's one panel (white in light, slate-900 in dark) or draws its own list on the frame with its panel beside it. A floating app, quick ask's box, draws on its see-through window with no frame or panel, and its own edge and shadow. The window shall show none of Studio's title bar, tabs, places or status bar. It shall keep the shell's toasts, live regions and Esc handling. Its title shall be the app's page, the workspace's name and the app's own name, as in "Inbox · Acme · Halonic Inbox". While there is no workspace to open, the window shall say "Open Halonic to choose a workspace." with one button, "Open Halonic", that asks the host to bring Studio's window forward (HAL-18188).

## Examples

- Given a feature that adds the focused app `inbox`,
  when the Inbox window draws for the workspace Acme,
  then it shows the Inbox's view in the panel, no places or tabs, and the title "Inbox · Acme · Halonic Inbox".
- Given no workspace,
  when the Messenger window draws,
  then it says "Open Halonic to choose a workspace." with an "Open Halonic" button,
  and pressing it asks the host to bring Studio's window forward.
- Given a feature that adds the focused app `runs`,
  then creating the shell throws a `ShellError` naming the feature.
- Given a feature that adds the focused app `ask` as floating,
  when its window draws,
  then the view is on the see-through window, with no frame and no panel.
