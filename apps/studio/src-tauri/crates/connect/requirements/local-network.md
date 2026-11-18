# studio.src-tauri.crates.connect.local-network

- Status: draft
- Since: 0.1.0
- Source: HAL-12253 (Android 17 local network permission)

The connect check shall say that a Connect press needs Android's local network permission when the address is a `.local` name, which Android looks up on the Wi-Fi, or when any IP address the hello call may connect to is on the home network and isn't loopback. Loopback and public addresses, including Tailscale's `100.64.0.0/10`, shall never need it. If the permission is turned down, then the shell shall return "no local network permission" with the address as shown back and whether Android will ask again on the next press, instead of making the hello call. If the shell can't tell, then it shall say Android won't ask again.

## Examples

- Given `192.168.1.20:4280` or `my-laptop.local:4280`,
  when the press is checked,
  then it needs the local network permission.
- Given `localhost:4280`, `https://100.101.102.103` or `https://halonic.example`,
  when the press is checked,
  then it doesn't need the permission.
- Given the permission was turned down once for `192.168.1.20:4280`,
  when the result is returned,
  then it is `{"kind":"noLocalNetwork","address":"192.168.1.20:4280","askAgain":true}`.
- Given the permission was turned down for good, or the shell can't tell,
  when the result is returned,
  then `askAgain` is `false`.
