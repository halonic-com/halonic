# studio.connect.remembered-address

- Status: active
- Since: 0.1.0
- Source: HAL-1140 (flow-install-update 5.3 and 5.4, microcopy 20.4 and 2)

The connect page shall store only the address. When the app opens with a remembered address, the page shall show only the logo and ask the shell about that address; if no answer has come after one second, it shall also show "Connecting…" as a status that screen readers read. If the computer isn't answering, then the page shall show "Halonic on your computer isn't answering." with Try again and Change address, and the focus on the message when it replaces another screen. When the user presses Change address, or the shell opens the page to change the address, the page shall show the connect screen with the address filled in and the focus in the field.

## Examples

- Given a remembered `192.168.1.20:4280` that answers,
  when the app opens,
  then the connect screen never shows and the page opens the confirmed address.
- Given a remembered address that isn't answering,
  when the app opens,
  then the "isn't answering" screen shows with the focus on its message; Try again is busy while it asks again and keeps the focus.
- Given the "isn't answering" screen,
  when the user presses Try again and the shell answers "isn't Halonic",
  then the connect screen shows the field error with the focus in the field.
- Given the shell opened the page to change the address,
  when the page starts,
  then nothing is sent and the connect screen shows with the remembered address filled in.
