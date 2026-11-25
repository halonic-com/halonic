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

All coefficients live in `src/coefficients.ts`, written from variant-router's
`export_halonic_detectors.py` so they can be retrained on production runs; the Python-scored
cases from the same export are in `src/end-of-run-selftest.ts` and `src/in-run-selftest.ts`.
The tests score every case and fail if this port disagrees with the Python model by more
than 0.001.

Every model was fitted on one writer setup, `calibratedOn` (opencode, deepseek-v4.1-flash on
deepinfra-fp8). Both scoring functions take the attempt's setup and return `kind: "refused"`
for any other, because turns, tool calls, seconds and tokens mean different things on another
agent, model or provider.

The end-of-run and 3-minute models are trained (held-out AUC 0.785 and 0.720 on live runs).
The 6- and 10-minute models are placeholders (`trained: false`: every attempt scores 0.5 and
none is flagged) until there are enough live runs to fit them; on today's data they scored
0.68 and 0.50.

## Decision log and weekly metrics

`DecisionEntry` is one line of the retry policy's decision log: an attempt's start, each
checkpoint score (features, thresholds, spawn, stop), a stop, an end-of-run score, the ship
choice (attempt, attempts, cost, wait) and the shipped change's later outcome, pass or rework.
Entries hold numbers and choices only, never the prompt, the diff or check output. The policy
writes them through a `DecisionLog` (one JSON line each, `decisionLine`); `readDecisionLines`
reads a log back for retraining, and `weeklyMetrics` counts passes, reworks and fallbacks per
week (Monday, UTC).
