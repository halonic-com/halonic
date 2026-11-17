# Decision: point the Get updates requirement at the new per-item requirement

- Task: HAL-10718
- Approval: Liam reviews and signs this on HAL-10718 (https://paperclip.halonic.com/HAL/issues/HAL-10718); his comment there says he signs any decision note on the task. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

The active requirement `source-control.get-updates-per-item` (added by the app-side pull request) gains the page's part:
the Changes page starts the merge, shows the choices and tiles, the in-the-middle strip with Continue, and makes Create
version, Get updates and Undo these changes unavailable while a merge is started, with three new Given/When/Then lines.
Nothing it said before is removed or weakened.

The active requirement `source-control.get-updates` has one sentence that said choosing between the two sides per item
was not part of it, and that both sides having moved "only stops with the toast above". That sentence now says the choice
is `source-control.get-updates-per-item` and that it replaces the toast when both sides have moved. The new requirement
is added in this pull request. No test was weakened or skipped.

## Why

With the per-item choice built, the old sentence is wrong: when both sides have moved the page now offers Keep mine, Use
theirs and Keep both instead of stopping with a toast.

## Covers

- source-control.get-updates
- source-control.get-updates-per-item
