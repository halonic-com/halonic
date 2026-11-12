# shell.settings-window

- Status: active
- Since: 0.1.0
- Source: HAL-7279 (T11 PR 10); flow-settings 2 and 3 (HAL-646); UX checklist part 3, 3.1 (HAL-1185)

The Studio window shall give the views and commands it draws a way to open Settings, `openSettings`, with or without the section to show. When it is called, the window shall show Settings with the sections features added, on the section `shell.settings-open` picks, the section shown when Settings last closed being the last one shown in this window. Where the Studio runs as the desktop app, Mod , shall open Settings, with `Mod` meaning Cmd on macOS and Ctrl elsewhere; the same key with Shift or Alt shall do nothing. The shell shall leave the key alone while a modal dialog is open, while an input method composes, and when the page has already handled it. Served Studio shall leave Mod , to the browser. When Settings closes, the window shall stop showing it.

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
- Given served Studio in a browser,
  when the user presses Ctrl ,,
  then Settings stays closed and the key is left to the browser.
- Given Settings is open,
  when the user presses Escape,
  then Settings closes.
