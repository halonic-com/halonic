# Decision: the run page in the Runs page's content pane, and the click test's wide Runs check

- Task: HAL-20729
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20729 (the plan Liam approved, Sofia's design check on HAL-20755, and Julian's review of #6861 asking for these amendments)
- Kind: user-visible

## What changes

The Runs page gets a list column and a content pane (`runs.list-column`, new in this pull
request). Two active requirements described the run page and the click test before it, so
they now say what the pane changes:

`runs.run-page`:

- The run page shows in the active tab, one run per tab, or in the Runs page's content pane
  where `runs.list-column` puts it there. A run's own tab is unchanged.
- On a phone, the heading is still for screen readers only on a run's own page, where the top
  bar says "Run #42". In the content pane the top bar says "Runs", so the heading shows.

`studio-click-test.places-open`:

- The installed app's 800 × 600 window shows the Runs list alone, so once Runs shows its text,
  the step widens the window to 1280 × 800, requires "No run open" in the content pane, and
  gives the window its size back.
- It can now fail as `NO_RUNS_WIDE_PAGE`, and, through the shared wide-window helper, as
  `NO_WIDE_WINDOW` or `WINDOW_NOT_RESTORED`. An example for `NO_RUNS_WIDE_PAGE` is added.

## Tests

No test was weakened or removed. The Runs page's row-click test in
`runs-app-view.test.tsx` now checks that the run shows in the pane instead of a tab, as the
pane replaces the tab for that click. `places-open.test.ts` gains two tests for the wide
check, and its page texts include the wide text.

## Covers

- runs.run-page
- studio-click-test.places-open
