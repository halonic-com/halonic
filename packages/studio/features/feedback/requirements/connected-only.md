# feedback.connected-only

- Status: active
- Since: unreleased
- Source: HAL-19240; Chief's release-gate note G2 from HAL-19383 (a safe default until the board answers on the 0.2.0 release card who gets Send feedback)

While Studio isn't connected to Paperclip, the Feedback feature shall not hear the feedback shortcut,
letting the keys through as if it weren't there, and shall show neither Settings → Feedback nor the
Send feedback row in Settings → Keyboard. When Studio connects, the shortcut, the section and the row
shall come back without a restart. Where the app doesn't say whether Studio is connected, it counts
as connected.

## Examples

- Given Studio not connected to Paperclip,
  when the person presses Ctrl+Shift+F,
  then the shell isn't asked to start and the keys go on to the window.
- Given Studio not connected to Paperclip,
  when the person opens Settings,
  then there is no Feedback section and Keyboard shows only the Quick ask row.
- Given Studio that connects to Paperclip,
  when the person opens Settings,
  then the Feedback section shows.
