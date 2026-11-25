# studio.src-tauri.feedback-presses

- Status: draft
- Since: unreleased
- Source: HAL-18919, from the reviews of HAL-18778 (#6188), and HAL-18970, from the reviews of #6259; builds on `studio.src-tauri.feedback-capture`

The feedback shortcut shall hold Ctrl, Alt or Super (⌘ on macOS). The command `plugin:feedback|shortcut_set` shall refuse one that holds none of them, such as `Shift+F` or `F`, as `invalid`, and a saved host setting `feedback.shortcut` that holds none of them shall give the default shortcut.

While a press's stills are being taken and its overlays opened, another press shall do nothing, and when taking them fails or panics, the next press shall take a capture again. While the Send feedback window is open, a press shall bring that window forward and take no capture; once that window was asked to close, a press shall take a new capture. Where no still can be taken, such as on macOS or Linux on Wayland, a press shall open the `feedback-unavailable` window, or bring it forward when it is open. When an overlay or the Send feedback window closes after a later press took its stills, the shell shall leave the later press's stills alone.

When `plugin:feedback|shortcut_set` has registered the new keys and can't save them, it shall register the old keys again, let go of the new ones and be refused as `failed`. If another app took the old keys in between, or the new keys won't let go, the new keys shall stay registered and the old keys shall be let go. One change shall run at a time, from registering its keys until they are saved or put back.

## Examples

- Given Studio's window,
  when it sets the shortcut `Shift+F`,
  then it is refused as `invalid` and the shortcut stays as it was.
- Given a saved shortcut `F`,
  when the shell reads the saved shortcut,
  then it gets Ctrl+Alt+F.
- Given a press whose stills are still being taken,
  when the person presses the shortcut again,
  then nothing more happens, and the first press's overlays open.
- Given the Send feedback window with text typed,
  when the person presses the shortcut,
  then the window comes forward with its crop and text, and no capture is taken.
- Given a Send feedback window that closes after the next press took its stills,
  when it has closed,
  then the next press's overlays still get their stills.
- Given the shortcut Ctrl+Alt+F,
  when Studio's window sets Ctrl+Alt+K and the setting can't be saved,
  then it is refused as `failed`, Ctrl+Alt+F works and Ctrl+Alt+K is let go.
- Given a capture that panics while it takes the stills,
  when the person presses the shortcut again,
  then a new capture starts.
- Given the Send feedback window that Cancel is closing,
  when the person presses the shortcut before it is gone,
  then a new capture starts.
- Given a change to Ctrl+Alt+K that is still saving,
  when Studio's window sets Ctrl+Alt+J,
  then that change waits until the first is saved or put back, and Ctrl+Alt+J ends up the only shortcut.
