# @halonicjs/retry-detectors

No-AI failure scores for a writer attempt, used by the retry policy (HAL-17073) to decide
when to start another attempt and which finished attempt to ship. Pure functions; no model
calls and no outside code.

- **End of run:** `scoreFinishedAttempt` reads what is known when the attempt stops (turns,
  tool counts, changed lines, seconds, exit, timeout, prompt length) and returns `pFail` and
  `flagged` (above 0.5). Port of variant-router `detector_scores.py` / `live_detector.py`.
- **In run:** `scoreRunningAttempt` reads the steps seen so far at minute 3, 6 or 10
  (`checkpointTags`, a port of variant-router `checkpoints.tags_at`).

Both read `AttemptStep`s, the per-step timeline of the writer's event stream.

## Coefficients

All coefficients live in `src/coefficients.ts`, written from variant-router's exports so they
can be retrained on production runs. A model with `trained: false` is the placeholder: it
scores 0.5 and flags nothing. The tests score every `selftest` case from the export and
fail if this port disagrees with the Python model by more than 0.001.
