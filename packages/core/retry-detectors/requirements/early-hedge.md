# retry-detectors.early-hedge

- Status: active
- Since: unreleased
- Source: HAL-18783, step 2 of HAL-17073; board, 23 Nov (early hedge); variant-router `hedge_sim.py` and REPORT.md "Keep-best and early-hedge"

The retry detectors package shall run a DeepSeek writer step under the early hedge only when the pilot flag is on, which it is not by default, and only on the writer setup the detectors were fitted on. It shall start one attempt and score each running attempt with the in-run detector at minute 3, 6 and 10 of that attempt. When a score is above the spawn threshold (0.5 by default), it shall start the next attempt next to the running one, once per attempt; when a score is above the stop threshold (0.85 by default), it shall also stop the attempt. An attempt that ends flagged by the end-of-run detector, or fails, without a next attempt shall get one too. It shall start at most 3 attempts and wait for every attempt it started to end. It shall then ship the finished, unflagged attempt with the lowest end-of-run score, never a stopped one; when there is none, it shall ship nothing and fall back to Opus. It shall report every start, checkpoint score, stop, end and the outcome for the decision log. The thresholds and the attempt limit shall be settings, and a threshold outside 0 to 1, a stop threshold below the spawn threshold, or more than 3 attempts shall be refused.

The package shall also turn a writer attempt's run events into the steps the detectors read: each model answer starts a turn with its input and output tokens, and each tool call is a step of the current turn, with the file an `edit` or `write` changed, the file a `read` read, and a `shell` call's command.

## Examples

- Given an attempt whose in-run score at minute 3 is 0.6,
  then a second attempt starts at minute 3 and the first keeps running.
- Given an attempt whose score at minute 6 is 0.9,
  then it is stopped and not shipped, even if it would have finished well.
- Given three attempts that all end flagged,
  then no fourth starts and the writer step falls back to Opus.
