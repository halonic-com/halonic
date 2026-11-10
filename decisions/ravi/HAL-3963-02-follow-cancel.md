# Decision: a follow subscribes again after a broken stream, and cancels on abort

- Requirement: `app.run-follow` (`packages/core/app/requirements/run-follow.md`)
- Task: HAL-3963; the maintainer's decision and note 3 in the review of #1209 on HAL-3961
- Approval: the maintainer approves this note in review
- Kind: internal

## What changes

`app.run-follow` said a follow fails with the stream's error whenever the stream breaks. The
port asks a caller to subscribe again after a broken stream, and the review of #1209 asked for
that for Studio: only after the follow has seen an event, and with a limit. So a stream that breaks
before any event still fails the follow with its error, as before. After an event, the follow
subscribes again, as the new `app.run-follow-resubscribe` says.

The same sentence of `app.run-follow` now also points to the new `app.run-cancel-on-abort`: when
the signal aborts, the follow still stops, closes the stream and fails with the events seen so
far, and it also cancels the run when the executor can.

The requirement's example of a broken stream now says "before the follow has seen an event". The
source line names HAL-3963.

## Tests

No test was removed or loosened. The test "fails with the stream's error when it breaks" broke
the stream after `run.started`, which now subscribes again, so it breaks the stream of a run
with no events instead, and also checks that the follow subscribed only once. The new behaviour
has its own tests under `app.run-follow-resubscribe` and `app.run-cancel-on-abort`.

## Covers

- app.run-follow
