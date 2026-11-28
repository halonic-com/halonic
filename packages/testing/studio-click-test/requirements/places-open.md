# studio-click-test.places-open

- Status: active
- Since: unreleased
- Source: HAL-18716 point 6 (the board's yes, 25 Nov), HAL-18870, HAL-20945

When the steps of `studio-click-test.try-it-steps` have run, the click test shall close a Settings dialog left open, open Inbox, Runs, Library and Changes in turn from the demo's Places list, and pass when each page shows its own text, read from the feature's words or UI file or the test that pins it: the Inbox's New request, the Runs app's summary line, either "No runs yet today." (a fresh install's demo has no run) or one starting "Today: " (a Paperclip account still connected from an earlier step lists its runs), the Library's Skills sentence, and any of the Changes page's states except its load failure. When Runs shows its text, the click test shall widen the window to 1280 × 800, where the Runs page has room for its content pane, require "No run open" there (`runs.list-column`), and give the window its size back. It shall check every place even after one fails, fail with the first failure's code, the place's load-failure line's code when the page shows it, `NO_RUNS_WIDE_PAGE` when the wide window doesn't show "No run open", `NO_WIDE_WINDOW` when the window can't be made wide, `WINDOW_NOT_RESTORED` when it can't be given its size back, else `NO_<PLACE>_PAGE`, and name every failing place in the note.

## Examples

- Given the demo, where every place shows its page,
  then step 16 passes.
- Given a connected Paperclip account, whose Runs page says "Today: 1 run · 0 failed" and shows "No run open" in a wide window,
  then step 16 passes.
- Given an Inbox that says "Couldn't load the Inbox" and a Changes page that shows only its heading,
  then step 16 fails as `INBOX_LOAD_FAILED`, and its note names Inbox and Changes.
- Given a Runs page that shows "No runs yet today." but no content pane in a 1280 × 800 window,
  then step 16 fails as `NO_RUNS_WIDE_PAGE`, its note says "Runs, in a wide window:", and the window gets its 800 × 600 size back.
- Given a Places list without Inbox,
  then step 16 fails as `NO_INBOX_PAGE`, and still tries the others.
- Given a page text copied from a file that no longer holds it,
  then the package's own tests fail.
