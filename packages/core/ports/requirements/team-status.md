# ports.team-status

- Status: active
- Since: unreleased
- Source: phase 2 architecture note (HAL-17511, sections 1.3 and 1.5, with Julian's security read HAL-17540); phase 2 prep, the board on HAL-10 (24 Nov, HAL-17601); task HAL-17602

The ports package shall have a `TeamStatus` port through which Studio's Team screens read which parts each source serves, spend, agent spend, seats, pull requests, one pull request's timeline and the merge queue, and hear which source changed, where every ID is opaque to apps, every item names its source, and every answer carries its source's own "as of" time. The port shall have no write member, and its `Seat` shall have no account, login folder or connection field.

The ports package shall have an `isAllowedWebLink(link, connectionOrigin)` check that passes only an `https` GitHub pull request page (`https://github.com/<owner>/<repo>/pull/<n>`) or a page on the connection's own origin, port included, and refuses any link with a user name or password.

## Examples

- Given the `TeamStatus` port,
  when its members are read,
  then they are exactly the reads and `changes`, and none writes.
- Given a `Seat` with an `account`, `configDir` or `connectionId`,
  when it is compiled,
  then it doesn't compile.
- Given the links `http://github.com/acme/app/pull/1`, `https://me:pw@github.com/acme/app/pull/1`, `https://github.com.evil.io/acme/app/pull/1`, `https://evil.io/github.com/acme/app/pull/1` and `https://github.com/acme/app/issues/1`,
  when they are checked,
  then each is refused.
- Given the connection origin `https://paperclip.acme.test`,
  when `https://paperclip.acme.test/HAL/issues/HAL-1` and `https://paperclip.acme.test:8443/HAL/issues/HAL-1` are checked,
  then the first passes and the second is refused.
