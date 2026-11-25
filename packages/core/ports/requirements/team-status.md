# ports.team-status

- Status: active
- Since: unreleased
- Source: phase 2 architecture note (HAL-17511, sections 1.3 and 1.5, with Julian's security read HAL-17540); phase 2 prep, the board on HAL-10 (24 Nov, HAL-17601); task HAL-17602; optional fields for Sofia's table 1.6 (HAL-17510), task HAL-17712

The ports package shall have a `TeamStatus` port through which Studio's Team screens read which parts each source serves, spend, agent spend, seats, pull requests, one pull request's timeline and the merge queue, and hear which source changed, where every ID is opaque to apps, every item names its source, and every answer carries its source's own "as of" time. The port shall have no write member, and its `Seat` shall have no account, login folder or connection field.

The port shall also carry, as optional fields that leave `teamStatusVersion` at 1, whether an answer came from the engine's offline cache (`fromCache`), why and when a seat's newest reading failed (`failedRead`, only on a seat whose state is `not-read` and whose windows and "as of" time stay the last good reading's), and how many runs of a spend summary have no known seat (`unknownSeatRuns`, never negative). A source that leaves all three out shall still be a whole `TeamStatus`.

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
- Given a `Seat`, a `SpendSummary` and an answer without `failedRead`, `unknownSeatRuns` or `fromCache`,
  when they are compiled,
  then they compile, and `teamStatusVersion` is still 1.
- Given a seat whose reading at 12:30 was rate-limited after a good reading at 12:20,
  when it is read,
  then its state is `not-read`, its `failedRead` is `rate-limited` at 12:30, and its windows and `asOf` are the 12:20 reading's.
- Given a seat with a `failedRead` cause the port doesn't name,
  when it is compiled,
  then it doesn't compile.

# ports.team-status.agent-detail

- Status: active
- Since: unreleased
- Source: agent and seat detail pages, flows 1.3 and 1.4 (HAL-17737); Liam's decision C on task HAL-18050

The `TeamStatus` port shall have an optional `agent(id, range)` read that answers one agent's `AgentDetail` for a spend range, or nothing when the source doesn't know the agent, and that leaves `teamStatusVersion` at 1. Every field of `AgentDetail` shall be optional: the seat it is on now with since when and who moved it (`seat-supervisor`, `board`, `observed` or `other`, never a login or a name), the seats it used in the range, its run total with failures counted by cause (`time-out`, `spend-limit`, `no-identity`, `adapter-error` or `other`), counts of merged pull requests and done tasks without titles, and a web link. A source without `agent` shall still be a whole `TeamStatus`.

## Examples

- Given a `TeamStatus` without `agent`,
  when it is compiled,
  then it compiles, and `teamStatusVersion` is still 1.
- Given an `AgentDetail` with only `asOf`,
  when it is compiled,
  then it compiles.
- Given an `AgentDetail` whose `movedBy` is a login, or whose failure cause the port doesn't name,
  when it is compiled,
  then it doesn't compile.

# ports.team-status.seat-detail

- Status: active
- Since: unreleased
- Source: seat detail page, flow 1.4 (HAL-17737); Liam's decision C on task HAL-18050

The `Seat` of the `TeamStatus` port shall also carry, as optional fields that leave `teamStatusVersion` at 1, each agent's share of the seat's week in percent (`agentShares`), the plan's plain-text label (`plan`), the plain-text label of the seats that share a manual reset (`manualResetGroup`) and a web link (`webLink`). A seat that leaves all four out shall still compile, and `Seat` shall still have no account, login folder or connection field.

## Examples

- Given a `Seat` without `agentShares`, `plan`, `manualResetGroup` or `webLink`,
  when it is compiled,
  then it compiles.
- Given a `Seat` with all four,
  when it is compiled,
  then it compiles, and it still can't carry an `account`.
