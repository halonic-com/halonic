# Decision: a phone's reactions reads count against a rate of their own

- Task: HAL-20260
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20260 (Julian's `[major]` on #6579, agreed there as this follow-up; the task picks a new kind as the simplest fix, the number for Julian's sign-off)
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:HfhZF4u9TxP4rFNb037zKfA7ZJsKPnZEbSRqT8jfn7NG4uxLPfuUwI9TzFaXljOTA5EwvtLbJwcnqs1VupUpCQ==

## What changes

- `remote-gateway.phone-reactions`: each `msg-read` of `reactions` now counts
  against the paired phone's reactions reads, and one over the rate is refused
  with `rate-limited` before the reactions are read. The examples gain that
  case, and the `not-supported` example now covers `msg-react` too.
- `agent-host.gateway-phone-messaging`: besides 10 searches and 10 sends a
  minute, a paired phone gets 30 reactions reads a minute, on a rate of their
  own. One example is added.

No test is skipped, weakened or deleted, and no requirement is retired. New
tests: the read over the rate, a `msg-react` with no reactions on the view
(the `[minor]` on #6579), and the 30-a-minute bucket.

## Why

A reactions read is the one phone read that isn't served from the hub's
cache: each one sends Paperclip a `listReactions`. Unrated, a stolen phone
could make one Paperclip request per round trip with the board's key, which
the phone rate exists to stop. A kind of its own keeps reading reactions from
using up a person's searches or sends. 30 a minute is three times the other
kinds because the phone reads reactions each time a chat opens or changes,
and a refused read only hides the chat's reactions; the chat itself still
shows.

## Covers

- remote-gateway.phone-reactions
- agent-host.gateway-phone-messaging
