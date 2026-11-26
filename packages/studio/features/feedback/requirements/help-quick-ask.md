# feedback.help-quick-ask

- Status: active
- Since: unreleased
- Source: HAL-19400 (UX gap G6 from the HAL-19383 walk-through, team decision with the designer: entries on approved screens, no new screen; plan approved by Liam on HAL-19400); the shell's command in `studio.src-tauri.quick-ask-show`

Where the app gives an opener for quick ask's box (Studio's own main window on the desktop), the Help menu shall have the item "Quick ask ({keys})" and Ctrl K the entry of the same name, and picking either shall show the box through `plugin:quick-ask|show`. The keys shall be the ones the shell reads through `plugin:quick-ask|shortcut`, written as a sentence writes them: "Ctrl+Alt+Space" until others are saved, joined by "+" on Windows and Linux, and in the platform's own key names with nothing between them on macOS, such as "⌥Space". When Settings saves new keys, the item and the entry shall name them. While the keys don't work (taken by another app, on Linux with Wayland, or where Studio hears no keys), or before the shell has said them, the item and the entry shall read "Quick ask" alone, so they never name keys that do nothing. Where the app gives no opener, as in the served Studio, on a phone or in any window but Studio's own, neither shall show. If the shell refuses to show the box, the Studio shall say why in the console from Help, and in a toast from Ctrl K. If the shell can't read the keys, the Studio shall say why in the console and name no keys.

## Examples

- Given Studio's own window on Windows with quick ask's keys working,
  when the person opens Help,
  then it lists "Quick ask (Ctrl+Alt+Space)", and picking it shows the box.
- Given Studio's own window on macOS,
  when the person types "Quick ask" in Ctrl K,
  then the entry reads "Quick ask (⌥Space)".
- Given another app holding Ctrl+Alt+Space,
  when the person opens Help,
  then it lists "Quick ask" with no keys.
- Given the served Studio,
  when the person opens Help or Ctrl K,
  then neither lists Quick ask.
