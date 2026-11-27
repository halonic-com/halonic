# studio-click-test.main-window

- Status: active
- Since: unreleased
- Source: HAL-19048

When the click test starts or restarts the app, it shall take as Studio's main window the window Tauri labels `main`, not the first window the driver lists and not a window found by its title, since Inbox or Messenger can open next to Studio after a restart and be listed first, and every window is titled "Halonic" until its page sets its own title. If no window is labelled `main` within 30 seconds, it shall take the first window and say so in its log.

## Examples

- Given the Inbox window listed before Studio's, both still titled "Halonic",
  when the click test starts the app,
  then Studio's window is the main window.
- Given only the Messenger window at first, and Studio's window a second later,
  then Studio's window is the main window.
- Given only the Messenger and Inbox windows for 30 seconds,
  then the first window is the main window.
