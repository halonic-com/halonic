# Decision: the phone chat's split test checks growth, not a fixed time

- Task: HAL-20604
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20604
- Kind: internal
- Signature:

## What changes

`remote.phone-messenger-links`, test "splits 100,000 characters of … in well under a second": it
asserted that one split of 100,000 characters took under 500 ms of wall-clock time. It now
asserts that splitting 100,000 characters takes under 10 times as long as splitting 25,000, each
the fastest of three splits, on the same runner. The requirement doesn't change.

## Why

The fixed time failed on busy CI runners with nothing wrong in the code: 1000 ms and 529 ms, then
505 ms on a re-run, on #6826, which doesn't touch `remote`. The rule is no flaky tests. What
HAL-20070 fixed was a rescan that grew with the square of the text (100,000 characters took
seconds). The new check catches exactly that: text four times longer takes about four times as
long when the split is linear, and sixteen times when it rescans. The limit of 10 leaves room for
noise on both sides. Each time is at least 1 ms, so a split too quick to time still gives a ratio.

## Tests

The test isn't weakened: it still fails on the quadratic split it was written for, in all three
cases. It no longer fails on a slow runner.

## Covers

- remote.phone-messenger-links
