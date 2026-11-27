# feedback.settings-quick-ask

- Status: active
- Since: unreleased
- Source: HAL-18960 (plan on HAL-18625, place agreed on HAL-19262); the words are section 7 of the HAL-18594 design, with the "taken" line Send feedback's (HAL-19570); the shell's commands in `studio.src-tauri.quick-ask-window`

Where the app gives quick ask's keys (Studio's own main window on the desktop), Settings → Keyboard shall show a row "Quick ask" under "Send feedback", with the keys the shell reads through `plugin:quick-ask|shortcut` (⌥ Space on macOS, Ctrl Alt Space elsewhere, until others are saved) and a "Change" button that records new keys as the Send feedback row does, and asks the shell to save them through `plugin:quick-ask|shortcut_set`. Where the app gives no quick ask keys, Settings → Keyboard shall show no Quick ask row. When the shell saves the new keys, the row shall show them. When the shell reads the keys as `taken`, or answers a change with `taken`, the row shall keep the keys it had and say "{Shortcut} is taken by another app. Choose another." under it, in the attention colour, naming the keys that are taken, in the same words as the Send feedback row. When the shell reads the keys as `wayland`, or answers a change with `wayland`, the row shall show no keys and no "Change", and say "Your desktop doesn't let apps add a shortcut. Add one in your desktop's settings that runs: halonic-studio --app ask". When the shell answers a change with anything else that isn't saved, the row shall keep the old keys and say "Couldn't save "Quick ask" on this computer.". If the shell can't read the keys, the Studio shall show no Quick ask row and say why in the console.

## Examples

- Given the keys Ctrl+Alt+Space that work,
  when Settings → Keyboard opens,
  then the Quick ask row shows Ctrl Alt Space and no line under it.
- Given another app holds Ctrl+Alt+Space,
  when Settings → Keyboard opens,
  then the row says "Ctrl+Alt+Space is taken by another app. Choose another."
- Given the keys Ctrl+Alt+Space,
  when the person records Ctrl+Alt+K and the shell answers `taken`,
  then the row still shows Ctrl Alt Space and says "Ctrl+Alt+K is taken by another app. Choose another."
- Given Linux with Wayland,
  when Settings → Keyboard opens,
  then the row says how to add a shortcut that runs `halonic-studio --app ask`, with no Change.
