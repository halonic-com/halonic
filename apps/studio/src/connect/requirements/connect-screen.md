# studio.connect.connect-screen

- Status: active
- Since: 0.1.0
- Source: HAL-1140 (flow-install-update 5.3 and 7.3, microcopy 20.4)

When the Android app opens with no remembered address, the connect page shall show the connect screen with the focus in the Address field. When the user presses Connect or the keyboard's Go key, the page shall send the address as typed, trimmed, to the shell and show Connect as busy ("Connecting…", `aria-busy`, keeping the focus), ignoring further presses until the shell answers. When the shell confirms the address, the page shall remember the address and open the address it confirmed.

## Examples

- Given a fresh install,
  when the app opens,
  then the connect screen shows with the focus in Address and nothing is sent.
- Given `192.168.1.20:4280` in the field, with spaces before and after it,
  when the user presses Connect twice,
  then the shell is asked once, with `192.168.1.20:4280`, and Connect says "Connecting…".
- Given the shell confirms `http://192.168.1.20:4280`,
  when its answer arrives,
  then the page remembers `192.168.1.20:4280` and opens `http://192.168.1.20:4280`.
