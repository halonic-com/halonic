# Decision: six small Studio fixes from the HAL-11120 walk

- Task: HAL-11190
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11120 (Sofia's walk of the approved screens found them; small wording and detail fixes on approved screens are a team decision, HAL-2282 rule; Priya reviewed the PR on HAL-11197)
- Kind: user-visible

## What changes

- `inbox.failed-run-notices`: a run the sandbox refused (`sandbox-not-ready`) makes no failed-run notice, because the sandbox row already counts it, and a notice names the routine by its name, or by its workflow's name when the routine is gone, never by its key.
- `studio.inbox-notices`: the app gives those names, with an example for a routine that is gone.
- `inbox.sandbox-row` and `studio.sandbox-refusals`: the sandbox card names each run the same way.
- `runs.run-view.sandbox-not-ready`: a passed check says "The sandbox is ready. The next run can start." instead of pointing to a Run again button that the page doesn't have yet.
- `files.ui.tree-view`: the empty state "No files yet" gets a **New file** button that opens the same dialog as **+**.

No test was weakened or skipped. The changed examples have tests.

## Why

The walk found the same run reported twice (notice and sandbox row), routine keys shown where people read names, a sentence pointing to a button that doesn't exist, and an empty Files view with no way to start. Each fix builds on a screen the board already approved.

## Covers

- inbox.failed-run-notices
- studio.inbox-notices
- inbox.sandbox-row
- studio.sandbox-refusals
- runs.run-view.sandbox-not-ready
- files.ui.tree-view
