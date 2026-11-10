# http-kit.address-classes

- Status: active
- Since: 0.1.0
- Source: HAL-983 (I5 design, HAL-958 section 3.8)

The address classes shall put every IP address in exactly one class (`public`, `private`, `loopback`, `link-local`, `metadata`, `unspecified` or `reserved`), and shall count an address as `public` only when it is a global unicast address outside every special-purpose block.

## Examples

- Given the answers a public name might resolve to in attack case A7 (`127.0.0.1`, `10.0.0.5`, `192.168.1.1`, `169.254.169.254`, `::1`, `fd00:ec2::254`, `::ffff:127.0.0.1`, `::ffff:169.254.169.254`, `64:ff9b::a9fe:a9fe`, an address in `fe80::/10` or `100.64.0.0/10`, `0.0.0.0`),
  when each is classified,
  then none is `public`.
- Given `93.184.215.14`, `2606:2800:21f:cb07:6820:80da:af6b:8b2c` and the NAT64 form of a public address `64:ff9b::5db8:d70e`,
  when each is classified,
  then each is `public`.
- Given a cloud metadata address (`169.254.169.254`, `169.254.170.2`, `100.100.100.200`, `fd00:ec2::254`),
  when it is classified,
  then it is `metadata`, not the wider block it sits in.
