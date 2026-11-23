# Decision: macOS key hints write Ctrl, Alt and Shift as ⌃, ⌥ and ⇧

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16898 (Sofia's design check of option A for HAL-16896; kit 21.1 and flow-assistant 5.8 want the Assistant's hint to read ⌃⌥I)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6vEk1ZAQlD+YR3j6UH8HhNmjbJUAD8LUkZTDFS4EZzh9Gw0sMf0kv3kRnao0unqClCGX9mIGQpjEA1Mr+vuZAg==

`shell.key-hints` gains one clause and one example: on macOS, Ctrl, Alt and Shift show as ⌃, ⌥
and ⇧, as macOS menus write them, next to the ⌘ that `Mod` already was. Windows and Linux keep
the names Ctrl, Alt and Shift. The order (Ctrl, ⌘, Alt, Shift, so `Mod` comes first) and
`aria-keyshortcuts` don't change: the kit's `keyShortcutsLabel` already reads the symbols back,
so ⌃ ⌥ I is still "Control+Alt+I". The macOS example now reads ⌘ ⇧ T instead of ⌘ Shift T.

The window tab menu's test expects ⇧ instead of Shift on macOS; it makes the same checks as
before. No test was weakened or dropped.

## Why

Every hint comes from one helper, so changing it there keeps all hints alike. A spelled-out
"Shift" or "Ctrl Alt I" next to ⌘ is not how a Mac writes a shortcut, and the Assistant button's
tooltip (T14) needs ⌃⌥I.

## Covers

- shell.key-hints
