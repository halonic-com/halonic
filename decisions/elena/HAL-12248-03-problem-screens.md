# Decision: the computer's "Too many wrong tries" becomes "The code was typed wrong 5 times"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15707 (team wording call on words check C618 #3; small wording on an approved screen, HAL-2282); the package owner's reviewer (Liam) approves this note in review
- Kind: user-visible
- Task: HAL-12248

## What changes

When a code was typed wrong 5 times, the Pair a phone dialog's title was "Too many wrong tries". It now
reads "The code was typed wrong 5 times", and its line reads "A code stops working after 5 wrong tries.
Nothing was shared. Make a new code, then try again." The button (Make a new code) and what it does stay
the same: it asks the same pairing for a new code, so remote stays on.

## Why

The phone shows "Too many tries" when the computer rate-limits it: wait a minute and keep the same code.
The computer's "Too many wrong tries" read like the same thing, but there the code is spent and the person
needs a new one. Different titles keep the two apart (C618 #3). No behaviour changes, and no test is
weakened: the dialog test now checks the new title.

## Covers

- remote.pair-a-phone-problems
