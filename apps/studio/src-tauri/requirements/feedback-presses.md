# studio.src-tauri.feedback-presses

- Status: draft
- Since: unreleased
- Source: HAL-18919, from the reviews of HAL-18778 (#6188), and HAL-18970, from the reviews of #6259; builds on `studio.src-tauri.feedback-capture`

The feedback shortcut shall hold Ctrl, Alt or Super (⌘ on macOS). The command `plugin:feedback|shortcut_set` shall refuse one that holds none of them, such as `Shift+F` or `F`, as `invalid`.

While a press's still is being taken, another press shall be refused as `busy`, and when taking them fails or panics, the next press shall take a capture again. While the Send feedback window is open, a press shall bring that window forward, take no capture and be refused as `send_open`; once that window was asked to close, a press shall take a new capture. Where no still can be taken, such as on macOS or Linux on Wayland, a press shall open the `feedback-unavailable` window, or bring it forward when it is open, and be refused as `unavailable`. When the Send feedback window closes after a later press took its still, the shell shall leave the later press's still alone.

`plugin:feedback|shortcut_set` shall save one change at a time; one it can't save shall be refused as `failed`.

## Examples

- Given Studio's window,
  when it sets the shortcut `Shift+F`,
  then it is refused as `invalid` and the shortcut stays as it was.
- Given a press whose still is still being taken,
  when the person presses the shortcut again,
  then it is refused as `busy`, and the first press's overlay shows.
- Given the Send feedback window with text typed,
  when the person presses the shortcut,
  then the window comes forward with its crop and text, and no capture is taken.
- Given a Send feedback window that closes after the next press took its still,
  when it has closed,
  then the next press's still is still held.
- Given the shortcut Ctrl+Shift+F,
  when Studio's window sets Ctrl+Alt+K and the setting can't be saved,
  then it is refused as `failed` and Ctrl+Shift+F stays the shortcut.
- Given a capture that panics while it takes the still,
  when the person presses the shortcut again,
  then a new capture starts.
- Given the Send feedback window that Cancel is closing,
  when the person presses the shortcut before it is gone,
  then a new capture starts.
