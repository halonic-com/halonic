# contracts.team-status

- Status: active
- Since: unreleased
- Source: phase 2 architecture note, sections 1.3 and 1.5 (HAL-17511), approved with the phase 2 card by the board on HAL-17544 (24 Nov); requirements `ports.team-status` and `ports.web-link`; tasks HAL-17602 and HAL-17652

Where an adapter implements `TeamStatus`, it shall pass this suite without network access of its own, given a provider that holds a source serving every part and a source serving only some. It shall name each source once in `parts`, and every spend, seat, pull request list and merge queue it gives shall come from a listed source that serves that part. A spend read shall give only the range it was asked for, and every answer shall say as of when with a time that parses. It shall find each open pull request by its ID, with a timeline, and give nothing for an ID it never gave. Every web link it gives shall pass `isAllowedWebLink` for its connection, and no seat shall carry an `account`, `configDir` or `connectionId` field.

## Examples

- Given a source that serves spend but not seats,
  when the seats are read,
  then none comes from that source.
- Given an ID the provider never gave,
  when that pull request is read,
  then the answer is `undefined`.
- Given a pull request the provider holds with a link to another host,
  when the pull requests are read,
  then no link it gives fails `isAllowedWebLink`.
