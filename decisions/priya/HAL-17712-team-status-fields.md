# Decision: TeamStatus gains three optional fields for table 1.6

- Approval: Liam approved the plan on HAL-17712, including the requirement change
- Kind: internal

The requirements ports.team-status and contracts.fake-team-status gain three optional fields, and nothing they already said is weakened or removed: `AsOf.fromCache` says an answer came from the engine's offline cache; `Seat.failedRead` gives the cause and time of a failed newest read, only with `state: "not-read"`, while `windows` and `asOf` stay the last good reading's; and `SpendSummary.unknownSeatRuns` counts runs with no known seat, a whole number never below zero. Each gets an example, and the fake can serve them. A source that leaves them out still passes, so `teamStatusVersion` stays 1. Both requirements are not released yet (`Since: unreleased`).

## Covers

- ports.team-status
- contracts.fake-team-status
