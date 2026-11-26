# Decision: waiting feedback lives in IndexedDB, one entry each, and the oldest is dropped at the cap

- Requirements: `feedback.outbox`, `feedback.outbox-retry` (`packages/studio/features/feedback/requirements/`)
- Task: HAL-18971 (PR C2 of HAL-18563), from Liam's decision on HAL-19010
- Approval: Liam decided this on HAL-19010 (options 2a and condition 3) and approves this note in
  his review of this pull request on HAL-18971
- Kind: user-visible

## What changes

The plan on HAL-18919 kept waiting feedback in a folder in the profile. The Send feedback window's
page can't write there without new shell commands, so Liam chose the webview's own IndexedDB
instead (HAL-19010, 2a). His condition 3: one database, one store keyed by feedback ID, the PNG
deleted in the same transaction that marks the item sent, and a cap of 50 items or 100 MB past
which the oldest is dropped and logged.

- **`feedback.outbox`:** it said "When 50 feedbacks are waiting, the feature shall keep no more and
  say so." Now the new feedback is always kept and the oldest is dropped, which the new
  `feedback.outbox-cap` states with the 100 MB limit. The sentence is replaced by a pointer to it.
  Nothing showed the "full" outcome yet, so no screen loses a message.
- **`feedback.outbox-retry`:** it said each screenshot is "its own file" and the waiting list holds
  none. Now each screenshot is kept with its feedback under the feedback's ID, listing the waiting
  feedback reads no screenshot (the store keeps it as a `Blob`), and the feedback and its
  screenshot are deleted in one step. The ID rule, the reason this requirement exists, is unchanged.

`FeedbackStore` changes with it: `load`/`save` of the whole list and separate image calls become
`list`, `add`, `update`, `loadImage` and `remove`, one entry at a time. That also drops the outbox's
own queue of list edits, which only existed because every change rewrote the whole list.

## Tests

No test was weakened. In `outbox.test.ts`, the "keeps no more than the limit" test and the "can't
keep because the list is full" test become the drop tests under `feedback.outbox-cap`, with a new
test for the 100 MB limit; the "screenshots out of the waiting list" test now checks the listed
entries hold no image bytes. The in-memory store follows the new interface. The new
`indexed-db-store.test.ts` checks the IndexedDB store against a small in-memory stand-in for the
browser's database (no new dependency), including that a removal is one read-write transaction.

## Covers

- feedback.outbox
- feedback.outbox-retry
