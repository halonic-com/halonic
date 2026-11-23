# shell.key-hints

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 9c; HAL-4251 (Kbd hints, words check by Sofia); base component specs 23 (Kbd); HAL-16896 (macOS modifier symbols, kit 21.1)

When a part of the shell shows the keys of a shortcut, the shell shall write them from the same keys a keybinding uses, through one helper, so every hint reads the same: `Mod` shall show as ⌘ on macOS and as Ctrl on Windows and Linux, on macOS Ctrl, Alt and Shift shall show as ⌃, ⌥ and ⇧ as its menus write them, while Windows and Linux keep the names Ctrl, Alt and Shift, the modifiers shall come before the key in the order Ctrl, ⌘, Alt, Shift, so `Mod` is always first, each key in its own Kbd box with no separator, and Escape and the arrow keys shall show as Esc, ↑, ↓, ← and →. The control shall name the same keys in `aria-keyshortcuts` with the kit's `keyShortcutsLabel`. Keys that a keybinding couldn't use shall be refused with a `ShellError`.

## Examples

- Given the keys "Mod+Shift+T",
  when the shell shows them on macOS,
  then the Kbd reads ⌘ ⇧ T and `aria-keyshortcuts` is "Meta+Shift+T"; and on Windows it reads Ctrl Shift T, "Control+Shift+T".
- Given the keys "Ctrl+Alt+I",
  when the shell shows them on macOS,
  then the Kbd reads ⌃ ⌥ I and `aria-keyshortcuts` is "Control+Alt+I"; and on Linux it reads Ctrl Alt I.
- Given the sidebar's Search box on Linux,
  when it is drawn,
  then its hint reads Ctrl K.
- Given the Ctrl K palette's footer on macOS,
  when it is drawn,
  then it reads Enter "Open here", ⌘ Enter "Open in a new tab" and Esc "Close".
