# Decision: the Runs banners take the approved words

- Approval: HAL-11370 (design check R1, words from microcopy revision 104, decided by the team under HAL-2282)
- Kind: user-visible

## What changes

`runs.run-view.sandbox-not-ready`: the refused-run banner now reads "*Agent* didn't start: the sandbox
can't start on this computer.", links the guide, and turns **Check again** into **Run again** once
the check passes, saying "The sandbox works now. You can run *Agent*." Before, it said "the sandbox
on this computer isn't ready.", named no button after a pass and said "The sandbox is ready. The next
run can start." Examples are changed to the new words and two are added; none is removed.

`runs.run-view.run-again`: a run that doesn't start reads "Couldn't start the run: *reason*" (a
colon, was a full stop) and is announced. Two examples are changed to the new words.

## Why

Microcopy 23.3 and 9.6 gave these words, and the design check found the build used older ones.

## Covers

- runs.run-view.run-again
- runs.run-view.sandbox-not-ready
