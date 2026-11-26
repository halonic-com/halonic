# auto-approvals.shadow-runner

- Status: active
- Since: unreleased
- Source: HAL-19462 (shadow-mode build plan, PR 4), HAL-19416 (design rev 2, sections 6 to 10), HAL-19417 (threat model rev 2, G1 to G4), HAL-19463 (red-team cases), HAL-19901

When the auto approvals shadow runner polls, the auto approvals package shall read Paperclip only through the read-only `ShadowSource` port, one read at a time, and shall write one ledger entry with outcome "no decision" and its first reason for every pending approval it evaluates, with no payload hash when the payload can't be hashed, whatever the entry's reason. The package shall read the stop document and the never-list again before every approval, judge the never-list's 24 hours by the server's `Date`, and stop the poll with one run entry and its reason when a read fails, the server time is missing or more than 2 minutes off the laptop clock, more than 500 approvals are pending, or a pinned document doesn't check out. The package shall halt for good, until a person restarts it, when the ledger chain is broken or lacks the last digest's head, a ledger write fails, or the source refused a request. After a 429 answer the package shall double the wait before the next poll, up to an hour. The daily digest shall give every count with its denominator, say "not measured: no rules in v1" for counts that need a rule, show stopped time and leave it out of the counts, and list the call counts (the writes sent counted below the source's guard), the ledger head, the build, the red-team result and the day's revisions of both pinned documents with their authors.

## Examples

- Given B0, one clean pending approval,
  then the ledger holds `run.started`, `card.untyped` and `poll.ran`, all "no decision".
- Given an owner's `stop: true` that lands after the first of two approvals,
  then the second approval isn't evaluated and the poll's run entry says `stop.stopped`.
- Given the source refused one request,
  then the poll stops with `guard.refused` and every later poll stops too.
- Given three 429 answers in a row,
  then the next poll waits 10, 20, then 40 minutes.
