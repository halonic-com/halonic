# contracts.fake-team-status

- Status: active
- Since: unreleased
- Source: phase 2 architecture note (HAL-17511, sections 1.3 and 3, P1): every Team screen builds against a fake until the Paperclip provider serves team status; task HAL-17602; the optional table 1.6 fields, task HAL-17712

The `FakeTeamStatus` shall be a `TeamStatus` that runs in the process, so Studio's Team screens can be built and tested before any provider serves one. A test shall be able to add sources that serve some or all parts, set spend and merge queues, add agent spend, seats, pull requests and timeline steps, and cut and restore a source's line. It shall refuse to fill a part its source doesn't serve, keep two sources apart, list a repo's open pull requests and those merged or closed in the last 24 hours, drop a web link `isAllowedWebLink` refuses for the source's origin, and tell a reader which source changed. Offline, it shall give a source's team status as it was when the line was cut, as of its last read, with each dated answer marked `fromCache`, and live answers shall carry no such mark. A seat added with a `failedRead` shall be `not-read` unless told otherwise.

## Examples

- Given a source that serves no seats,
  when a seat is added to it,
  then it throws, and its parts say it serves no seats.
- Given a pull request merged 2 hours ago and one closed 3 days ago,
  when the pull requests are listed,
  then the first is in `recent` and the second is in neither list.
- Given a pull request added with the link `https://github.com.evil.io/acme/app/pull/1`,
  when it is read,
  then it has no web link.
- Given a source last read at 10:00 whose line was cut at 14:05,
  when a seat is added and the seats are read,
  then the new seat isn't there, and the seats are as of 10:00.
- Given a source whose line was cut,
  when its seats, spend, pull requests and merge queue are read,
  then each answer is marked `fromCache`, and once the line is back none is.
- Given a seat added with a `failedRead` of `rate-limited` and no state,
  when it is read,
  then its state is `not-read`.
