# retry-detectors.decision-log

- Status: active
- Since: unreleased
- Source: HAL-18785, step 4 of HAL-17073 ("log every decision for retraining"; board, 23 Nov, early hedge)

The retry detectors package shall define one decision log entry for every decision the retry policy takes on a writer task: an attempt's start (first or spawned, with its writer setup), each checkpoint score with its features, the spawn and stop thresholds and whether it spawned or stopped an attempt, an attempt's stop, an attempt's end-of-run score with its features, the ship choice (one attempt or none) with attempts, cost and wait time, and the shipped change's later outcome (pass or rework). It shall write each entry as one line of JSON and read a log back, skipping and counting any line it cannot read.

## Examples

- Given a ship entry,
  when it is written and read back,
  then the same entry comes back and nothing is skipped.
- Given a log with a torn last line,
  when it is read,
  then the whole entries come back and one line is skipped.
