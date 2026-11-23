# retry-detectors.end-of-run

- Status: active
- Since: unreleased
- Source: HAL-17088, step 1 of HAL-17073; variant-router `detector_scores.py` and `live_detector.py` (REPORT.md "Correction")

The retry detectors package shall score a finished writer attempt without a model call, from its steps, its diff, its wall seconds, its exit code, whether it timed out and the length of its prompt: turns, the counts of the shell, read, edit, write and grep tools, a failed exit (a nonzero exit code or an error the harness reported), the changed lines inside the diff's hunks, whether nothing was edited, and the diff size against an expected size (50 lines when none is known). It shall never read the attempt's check result. It shall return the probability that the attempt fails and flag the attempt when that probability is above the model's threshold. The coefficients shall come from one data file; while that file holds the untrained placeholder, every attempt shall score 0.5 and none shall be flagged.

## Examples

- Given an attempt whose diff has one hunk with one removed and one added line under its file headers,
  then its changed lines are 2.
- Given an attempt with no edit or write step, that timed out and exited with 1,
  then no edit, timed out and failed exit are each 1.
- Given the untrained placeholder,
  then any attempt scores 0.5 and isn't flagged.
