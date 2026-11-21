# Decision: the this-computer-start banner keeps the launcher's reason in Copy details

- Approval: HAL-15362, row 11 of the words check C566 on HAL-15352; wording on an approved screen, decided by the team under HAL-2282
- Kind: user-visible
- Task: HAL-15362

## What changes

`runs.run-view.this-computer-start` no longer puts the launcher's reason on the run page's banner.
The banner now reads "*Support reply* failed in the step *Draft*: *Writer* didn't start on this
computer. Nothing ran in that step. Halonic can't fix this from here: copy the details and report
it." The reason stays in **Copy details**, where it already was. **Copy details** and no
**Run again**, the general banner for a log without the step's start, and never naming a sandbox
stay as they were.

## Why

The reason is Halonic's own internal text (the first line of what the launcher threw), with words
such as "fence", "bridge" and "Unix socket"; the words rules E1 and E3 keep that in Copy details.
With no Run again, the banner had no next step in words (E2); the new last sentence matches the
CLI's line 2, "Add --debug to see the details, and report it" (E4).

The CLI's line 1 (`cli.run-failed-this-computer-start`) keeps the reason: the task leaves that to
the owner, and a terminal, where `--debug` is one flag away, is where details like this live.

The test makes more `expect` calls than before: a new test checks that the reason is on Copy
details and not on the banner. No test was weakened or removed.

## Covers

- runs.run-view.this-computer-start
