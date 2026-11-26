# studio.connect.app-shortcuts

- Status: draft
- Since: unreleased
- Source: HAL-19143 (Android shortcuts to Inbox and Messenger, plan approved on HAL-19148)

The Android app's own page shall reach the shortcuts only through the shell's `phone_open_target`, `phone_last_chat`, `phone_can_pin` and `phone_pin`. When the shell answers a screen the page doesn't know, refuses a call or answers that it did nothing, the page shall log it, treat it as no screen, or as a launcher that can't pin, and change nothing else.

When the phone has no paired computer and an address is remembered, the page shall start as in `studio.connect.remembered-address` whatever screen a shortcut asked for, and shall take that screen so it isn't used later: the Studio that launch opens has no address for a screen.

## Examples

- Given the shell answers `{"screen": "chat", "computer": "acme-desk", "chat": "c1"}`,
  when the page takes the opening,
  then it gets that chat on that computer.
- Given the shell answers `{"screen": "settings"}`,
  when the page takes the opening,
  then it gets none.
- Given the shell refuses `phone_can_pin`,
  when the page asks whether it can pin,
  then the answer is no and the refusal is logged.
- Given no paired computer, the address `192.168.1.20:4280` remembered and an Inbox shortcut tapped,
  when the page starts,
  then it connects to that address as in 0.1 and the Inbox opening is taken.
