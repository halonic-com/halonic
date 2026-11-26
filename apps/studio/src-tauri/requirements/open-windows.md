# studio.src-tauri.open-windows

- Status: draft
- Since: unreleased
- Source: HAL-19534 (board request: reopen every Halonic window open at quit, where it was); plan approved on HAL-19566; the windows in `studio.src-tauri.focused-apps`, their places in `studio.src-tauri.window-place`

While Halonic runs on the desktop, the shell shall keep a list of the app windows that show (Studio's, the Inbox's and the Messenger's, by window label), which one has the focus, and each one's content, in the profile's `studio/open-windows.json`, and shall write it, and the windows' places, when a window shows, hides or closes, or the focus moves from one app window to another, only when it changed. While the focus is on no app window, as when the user clicks the tray or switches to another program, the app window that had it last shall count as focused. The shell shall read the list once at start, before any window opens. It shall never list another window (the feedback, brief or quick ask windows) and shall never write an empty list, so the last window closing leaves its own entry. Windows gives the shell no notice of a shutdown, so a shutdown shall leave the list last written. Once Quit, ⌘Q or an exit starts, the shell shall write the list one last time and then not again. When Halonic starts without `--background`, and on the first window opened after a start with it, from the tray, the Dock on macOS, a notification's click or quick ask's chat, the shell shall open every listed window again, in its kept place, with the one the start asks for, or else the one that had the focus, in front; a later start that Halonic hands to the running one shall only show the window it asks for. A list that is missing, can't be read, is over 48 KB or has another format shall count as empty. Where Settings › Startup's **Reopen windows on start** (the host setting `windows.reopen-on-start`, `settings.startup-section`) is off, the shell shall open only the window the start asks for; a missing setting counts as on.

An app window's page may keep its content with `window_content_set` and read it back with `window_content_get`, granted to those three windows only and to no served page. Both shall take the window from the call, never from an argument. A content over 2,048 bytes shall be refused as `too_long`, never cut short, and a call from another window as `not_an_app_window`. A content change shall write the list of the windows last noted with the new content, without reading the windows again, and nothing before a window was noted in this run. The shell shall never read the content; a page shall keep only ids and paths there that it checks again when it reads them back, never a secret, a token or a file's text, and shall show its app's start screen when what they name no longer exists.

## Examples

- Given Studio, the Inbox and the Messenger open, the Inbox focused,
  when Halonic quits from the tray and starts again,
  then all three windows open in their places, the Inbox in front.
- Given the same three windows open,
  when Windows shuts down and Halonic starts again,
  then all three windows open again.
- Given only the Messenger open, and "Reopen windows on start" off,
  when Halonic starts,
  then only Studio's window opens.
- Given Studio and the feedback window open,
  when Halonic quits and starts again,
  then only Studio's window opens.
- Given Halonic started at login, with the Inbox and the Messenger open at the last quit,
  when the user opens Halonic from the tray,
  then the Inbox and the Messenger open.
- Given Halonic started at login, with Studio and the Inbox open at the last quit,
  when the user sends a question from quick ask and its chat opens in the Messenger,
  then Studio, the Inbox and the Messenger open, the Messenger in front, and the list is kept up to date from then on.
- Given the Messenger's page keeps a 3,000-byte content,
  then `window_content_set` is refused as `too_long` and the content kept before stays.
