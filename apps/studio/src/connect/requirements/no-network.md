# studio.connect.no-network

- Status: active
- Since: unreleased
- Source: HAL-15159 (D7 design, B7 item 4, Julian's M2); HAL-15178

The connect page shall have no way onto the network: its content security policy shall be exactly `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'`, both in the `<meta>` tag of the built `connect.html` and in the policy Tauri sends with the page on Android. The only addition allowed is a hash or nonce in `script-src`, which Tauri adds to the policy it sends for the scripts it injects. A policy with `'unsafe-inline'`, `'unsafe-eval'`, `blob:` or `data:` in `script-src`, or with `*`, a host, or an `http:`, `https:`, `ws:` or `wss:` source in any directive, other than `http://ipc.localhost` (Tauri's IPC on Android) in `connect-src`, shall fail the check.

## Examples

- Given the built `connect.html`,
  then its one policy tag is exactly the policy above.
- Given the Android config, merged over the desktop one, with the IPC sources and a script hash Tauri adds,
  then the policy is the one above plus that hash.
- Given a policy with `connect-src ipc: http://ipc.localhost https://example.com`,
  then the check names `https://example.com` as reaching the network.
- Given a policy with `img-src 'self' 192.168.1.20:4280`,
  then the check names the address.
- Given a policy with `script-src 'self' 'unsafe-eval'`,
  then the check names `'unsafe-eval'`.
- Given the `<meta>` tag with a hash in `script-src`,
  then the check fails: only the policy Tauri sends may carry one.
