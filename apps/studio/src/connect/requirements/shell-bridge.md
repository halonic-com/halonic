# studio.connect.shell-bridge

- Status: active
- Since: 0.1.0
- Source: HAL-1375 (flow-install-update 5.3 and 5.4)

When the page asks about an address, it shall call the shell's `connect` command with the address as typed and show the shell's answer. When the shell confirms an address, the page shall mark its own history entry as Change address and then open the confirmed address, so Android back from the Studio's first page returns to the connect screen with the address filled in. When the user presses Open release page, the page shall ask the shell's opener to open the release page and nothing else.

## Examples

- Given the address `8.8.8.8:4280`,
  when the page asks the shell,
  then it calls `connect` with `{"address":"8.8.8.8:4280"}`.
- Given the shell confirmed `http://192.168.1.20:4280/`,
  when the page opens the Studio,
  then its history entry becomes `#change-address` first.
- Given the app-too-old screen,
  when Open release page is pressed,
  then the opener is asked to open the release page.
