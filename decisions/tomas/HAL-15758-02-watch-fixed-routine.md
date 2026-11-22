# Decision: routines watch says when a routine that couldn't start is fixed

- Task: HAL-15758
- Approval: flow check C630 (HAL-15782) asks for this line on the task HAL-15758. The team decides it under the HAL-2282 rule, since it adds one line in the words of an existing `watch` line, to a flow the board already approved. Liam signs this note in review.
- Kind: user-visible

## What changes

- `cli.commands.routines.watch`: the tick that finds the file of a routine it left out fixed now prints "✓ Friday digest is fixed and starts on time again.", or "✓ Friday digest is fixed." for a routine that is off or that a web request starts, since the watch doesn't start those. A routine whose file was removed rather than fixed gets no line. The requirement's sentence about a routine whose file has errors says so, and its "when Friday digest's file is fixed" example names the line. Nothing else in the requirement changes.

## Why

In C630, a user fixed a broken routine file while `halonic routines watch` ran. For 100 seconds it printed nothing after "✕ Weekly report can't start until its file is fixed · halonic validate" and "Watching 0 routines in Acme.", so they couldn't tell whether the watch picked up the fix.

## Tests

No test was weakened or skipped. `watch-cant-start.test.ts`: the fix test now also checks the ✓ line before the routine's first run, and a new test checks the shorter line for a fixed routine that is off.

## Covers

- cli.commands.routines.watch
