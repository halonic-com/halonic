# shell.settings-window

- Status: active
- Since: 0.1.0
- Source: HAL-7279 (T11 PR 10); HAL-7331 (T11); HAL-8027 (T11 PR 9); flow-settings 2 and 3 (HAL-646); UX checklist part 3, 3.1 (HAL-1185)

The Studio window shall give the views and commands it draws a way to open Settings, `openSettings`, with or without the section to show, and the id and title of each section features added, `settingsSections`, in Settings' order, and a way to run a command by its id, `runCommand`, which says whether a feature added the command and, as Ctrl K does, shows a danger toast when the command fails. When it is called, the window shall show Settings with the sections features added, on the section `shell.settings-open` picks, the section shown when Settings last closed being the last one shown in this window. Where the Studio runs as the desktop app, Mod , shall open Settings, with `Mod` meaning Cmd on macOS and Ctrl elsewhere; the same key with Shift or Alt shall do nothing. The shell shall leave the key alone while a modal dialog is open, while an input method composes, and when the page has already handled it. While Settings is open in the desktop app, Mod , shall put the focus on the current section's row, unless a dialog on top of Settings has the focus. Served Studio shall leave Mod , to the browser. When Settings closes, the window shall stop showing it.

## Examples

- Given a feature adds the section `agent-sandbox` with scope `host`, in the desktop app,
  when the user presses Ctrl , on Windows,
  then Settings shows, with Agent sandbox under "On this computer".
- Given Settings showed Formats when it closed,
  when a view calls `openSettings()`,
  then Settings shows Formats.
- Given Settings showed Formats when it closed,
  when a view calls `openSettings("assistant")`,
  then Settings shows Assistant.
- Given Settings is open on Formats in the desktop app, with the focus in the section,
  when the user presses Ctrl ,,
  then Settings stays on Formats and the focus is on the Formats row.
- Given a feature adds Appearance and Assistant,
  when a command's context lists `settingsSections`,
  then it holds `appearance` "Appearance" and `assistant` "Assistant", in that order.
- Given a feature adds the command `models.open`,
  when a view calls `runCommand("models.open")`,
  then the command runs and the call answers true; for an id no feature added, it answers false.
- Given a command that throws,
  when a view calls `runCommand` with its id,
  then the call answers true and a danger toast says "Couldn't run" and the command's title.
- Given served Studio in a browser,
  when the user presses Ctrl ,,
  then Settings stays closed and the key is left to the browser.
- Given Settings is open,
  when the user presses Escape,
  then Settings closes.
