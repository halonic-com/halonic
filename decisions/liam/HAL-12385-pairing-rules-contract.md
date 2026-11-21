# Decision: the pairing rules move into the RemoteControl contract

- Approval: Liam planned it on HAL-12353 and split it out as HAL-12385; Julian reviews and signs it there
- Kind: internal

## What changes

`remoteControlContract` now holds every `RemoteControl` to `pairingRules`:
a code's life, the wait for Allow, the wrong tries a code takes and the
host's failed tries a minute. Its harness gets a small driver for this:
`phoneTriesWrongCode`, which plays a phone whose try failed and gives what
the host told it, and `advance`, which moves the host's time. The agent host
drives it through its pairing desk and its manual clock; the fake through
its simulated time.

The fake takes its defaults from `pairingRules` instead of its own numbers,
and gets the rule it was missing: after `pairingRules.failedTriesPerMinute`
failed tries within a minute it refuses every try, as the host does. Studio's
tests use at most 5 wrong tries, so none of them reaches it.

Four tests that checked these rules on one implementation only move into
the contract: the host's "ends a code after 5 minutes", and the fake's "ends
a code after 5 minutes", "a new code has a life of its own" and "waits 2
minutes for Allow". The two requirements say what the contract and the fake
now do.

## Why

Before, the contract left everything that runs out in time to each
implementation's own tests, and the fake had its own numbers and no
per-minute limit. A Studio screen built on the fake could then behave
differently from the real host. With the rules in the contract, the fake and
the host are held to the same numbers, from one place.

## Tests

No test was weakened. Each moved test is in the contract with at least as
many checks, and now runs on both implementations. The contract also checks
that a code takes a phone until the last millisecond of its life, that a
used code waits for Allow and not for its life, the `code-ended` and
`code-used` refusals, and the per-minute limit up to the millisecond it
lifts. Turning the fake's limit off fails two tests.

## Covers

- contracts.remote-control
- contracts.fake-remote-control
- agent-host.remote-control
