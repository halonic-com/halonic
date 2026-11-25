# studio.src-tauri.feedback-presses

- Status: draft
- Since: unreleased
- Source: HAL-18919, from the reviews of HAL-18778 (#6188); builds on `studio.src-tauri.feedback-capture`

The feedback shortcut shall hold Ctrl, Alt or Super (⌘ on macOS). The command `plugin:feedback|shortcut_set` shall refuse one that holds none of them, such as `Shift+F` or `F`, as `invalid`, and a saved host setting `feedback.shortcut` that holds none of them shall give the default shortcut.

While a press's stills are being taken and its overlays opened, another press shall do nothing. While the Send feedback window is open, a press shall bring that window forward and take no capture. When an overlay or the Send feedback window closes after a later press took its stills, the shell shall leave the later press's stills alone.

When `plugin:feedback|shortcut_set` has registered the new keys and can't save them, it shall register the old keys again, let go of the new ones and be refused as `failed`. If another app took the old keys in between, the new keys shall stay registered.

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
