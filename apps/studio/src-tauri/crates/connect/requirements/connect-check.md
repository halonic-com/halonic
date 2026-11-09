# studio.src-tauri.crates.connect.connect-check

- Status: draft
- Since: 0.1.0
- Source: HAL-1140, HAL-1150 (flow-install-update 5.3)

The connect check shall look a host name up before it judges it, and return the IP addresses it checked so the hello call connects only to them. If any address is unusable, or the scheme is `http://` and any address is not on the home network, then the check shall report "not on your home network". If the name resolves to nothing or the lookup fails, then the check shall report "not answering".

## Examples

- Given a name that resolves only to `192.168.1.20` and `fd00::20`,
  when `http://` is checked,
  then it passes with both addresses.
- Given a name that resolves to `192.168.1.20` and `8.8.8.8`,
  when `http://` is checked,
  then the result is "not on your home network"; with `https://` it passes.
- Given `https://0.0.0.0`,
  when it is checked,
  then the result is "not on your home network".
- Given a name that resolves to nothing,
  when it is checked,
  then the result is "not answering".
