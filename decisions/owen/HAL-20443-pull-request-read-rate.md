# Decision: a phone's pull request detail reads count against its reactions reads

- Task: HAL-20443
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20443 (Julian's finding on #6772; the task leaves the fix to the owner, Julian signs)
- Kind: internal

## What changes

- `remote-gateway.messaging-allow-list`: each `team-read` of one
  `pull-request` now counts against the paired phone's reactions reads, and
  one over the rate is refused with `rate-limited` before the pull request is
  read. One example is added.

No test is skipped, weakened or deleted, and no requirement is retired. New
test: the pull request read over the rate.

## Why

The pull request detail is, besides reactions, the other phone read the hub
doesn't cache: each one sends Paperclip a `pullRequestDetail`. Unrated, a
stolen phone could make one Paperclip request per round trip with the board's
key. This corrects #6772's note, which called reactions the only such read.
Sharing the reactions kind (30 a minute) caps both uncached reads without a
new number or a host change; no phone screen reads a pull request yet, so it
can't eat into a chat's reactions today. When a screen does, a kind of its own
or a hub cache can replace this.

## Covers

- remote-gateway.messaging-allow-list
