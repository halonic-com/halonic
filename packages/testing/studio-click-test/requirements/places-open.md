# studio-click-test.places-open

- Status: active
- Since: unreleased
- Source: HAL-18716 point 6 (the board's yes, 25 Nov), HAL-18870

When the steps of `studio-click-test.try-it-steps` have run, the click test shall close a Settings dialog left open, open Inbox, Runs, Library and Changes in turn from the demo's Places list, and pass when each page shows its own text, read from the feature's words or UI file: the Inbox's New request, the Runs app's "No runs yet today." (a fresh install's demo has no run), the Library's Skills sentence, and any of the Changes page's states except its load failure. It shall check every place even after one fails, fail with the first failure's code, the place's load-failure line's code when the page shows it, else `NO_<PLACE>_PAGE`, and name every failing place in the note.

## Examples

- Given the demo, where every place shows its page,
  then step 16 passes.
- Given an Inbox that says "Couldn't load the Inbox" and a Changes page that shows only its heading,
  then step 16 fails as `INBOX_LOAD_FAILED`, and its note names Inbox and Changes.
- Given a Places list without Inbox,
  then step 16 fails as `NO_INBOX_PAGE`, and still tries the others.
- Given a page text copied from a file that no longer holds it,
  then the package's own tests fail.
