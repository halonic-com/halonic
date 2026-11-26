# feedback.settings-shortcut

- Status: active
- Since: unreleased
- Source: HAL-18972 (plan on HAL-18919); the words are §5 of Sofia's sketch on HAL-18562; the shell's command in `studio.src-tauri.feedback-presses`

Where the app gives the feedback settings (Studio's own main window on the desktop), the Studio shall show Settings → Keyboard with a row "Send feedback", the feedback shortcut as keys (⌘ ⌥ F on macOS, Ctrl Alt F elsewhere, until another is saved) and a "Change" button. When the person chooses "Change", the row shall read "Press the new shortcut" with Esc to stop, and shall take every key press first, so that no press reaches the rest of Studio. When the person presses keys with Ctrl, Alt or ⌘ while it records, the Studio shall stop recording and ask the shell to save them through `plugin:feedback|shortcut_set`, by their physical keys. If a press has none of Ctrl, Alt and ⌘, the Studio shall not send it, and the row shall keep recording. When the shell saves it, the row shall show the new keys. When the shell answers `taken`, the row shall keep the old keys and say "{Shortcut} is taken by another app. Choose another." under it, in the attention colour. When the shell answers anything else that isn't saved, the row shall keep the old keys and say "Couldn't save "Send feedback" on this computer.". When the person presses Esc, chooses "Change" again or leaves the row while it records, the Studio shall stop recording and change nothing.

## Examples

- Given the shortcut Ctrl+Alt+F,
  when the person chooses Change and presses Ctrl+Alt+K,
  then the shell is asked for `Control+Alt+KeyK` and the row shows Ctrl Alt K.
- Given another app holds Ctrl+Alt+K,
  when the person records it,
  then the row still shows Ctrl Alt F and says "Ctrl+Alt+K is taken by another app. Choose another."
- Given the row is recording,
  when the person presses Esc,
  then it shows Ctrl Alt F again, the shell is asked nothing and Settings stays open.
