# studio-click-test.main-window

- Status: active
- Since: unreleased
- Source: HAL-19048

When the click test starts or restarts the app, it shall take as Studio's main window the window whose title ends in the plain app name ("… · Halonic" or "Halonic"), not the first window the driver lists, since Inbox or Messenger can open next to Studio after a restart and be listed first. If no window has such a title within 30 seconds, it shall take the first window and say so in its log.

## Examples

- Given the Inbox window, titled "Inbox · Halonic Inbox", listed before Studio's "Home · Acme · Halonic",
  when the click test starts the app,
  then Studio's window is the main window.
- Given Studio's window still titled "Halonic", before its page sets a title,
  then it is the main window.
- Given only the Messenger window, titled "Halonic Messenger", for 30 seconds,
  then the first window is the main window.
