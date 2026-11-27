# Decision: the phone chat's split test checks growth, not a fixed time

- Task: HAL-20604
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20604
- Kind: internal

## What changes

`remote.phone-messenger-links` (draft): the sentence "The phone shall split a message of 100,000
characters into text and links in well under a second" becomes "… in time that grows in step with
its length", and its example "splitting it takes well under a second" becomes "splitting it takes
under 30 times as long as splitting 10,000 `[`".

Its test "splits 100,000 characters of …" asserted that one split of 100,000 characters took under
500 ms of wall-clock time. It now asserts that splitting 100,000 characters takes under 30 times as
long as splitting 10,000, each the fastest of three splits, the two sizes taking turns on the same
runner.

## Why

The fixed time failed on busy CI runners with nothing wrong in the code: 1000 ms and 529 ms, then
505 ms on a re-run, on #6826, which doesn't touch `remote`. The rule is no flaky tests. What
HAL-20070 fixed was a rescan that grew with the square of the text (100,000 characters took
seconds). The new check catches that: ten times the text takes about ten times as long when the
split is linear (measured 10.0 to 10.2), and about a hundred times when it rescans (103 to 128 for
the splitter from before #6690). The limit of 30 leaves about three times room each way. Each time
is at least 1 ms, so a split too quick to time still gives a ratio.

## What the test no longer catches

A split that stays linear but gets slower. In review, raising the splitter's length limits made
100,000 `[` take 3.7 s and 100,000 characters of `[](` take 2.0 s, still linear; the old 500 ms
check failed both, the new one passes both. The requirement now promises only growth in step with
the length, which is what keeps a long message from freezing the chat.

## Tests

The test still fails on the quadratic split it was written for, in all three cases. It no longer
fails on a slow runner, nor on a split that is slower but still linear.

## Covers

- remote.phone-messenger-links
