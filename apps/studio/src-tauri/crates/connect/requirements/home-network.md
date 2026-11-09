# studio.src-tauri.crates.connect.home-network

- Status: draft
- Since: 0.1.0
- Source: HAL-1140, HAL-1150 (flow-install-update 5.3)

The connect check shall treat loopback, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, `::1`, `fc00::/7` and `fe80::/10` as the home network, and every other address as public. An IPv4 address in IPv6 form shall be judged as the IPv4 address it contains. The check shall treat `0.0.0.0`, `::`, multicast and broadcast addresses as unusable.

## Examples

- Given `192.168.1.20` or `fd00::20`,
  when it is sorted,
  then it is on the home network.
- Given `::ffff:8.8.8.8`,
  when it is sorted,
  then it is public, like `8.8.8.8`.
- Given `100.64.0.1` or `169.254.1.1`,
  when it is sorted,
  then it is public in 0.1.
- Given `0.0.0.0` or `ff02::1`,
  when it is sorted,
  then it is unusable.
