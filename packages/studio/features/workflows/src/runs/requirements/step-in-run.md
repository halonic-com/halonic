# workflows.runs.step-in-run

- Status: draft
- Since: unreleased
- Source: HAL-10228 (T7 PR 5c); flow-workflows 4.5 (HAL-1625); microcopy 21

While a run is shown on the canvas and the person picks a step, the workflows feature shall dock a card for that step at the right with one line on what happened to the step in the run, from the run's own summary: "✓ Ran in run *id*", "Ran *n* times in run *id*" for a step the run visited more than once, "✕ Failed here in run *id*", "Needs you here in run *id*", "Cancelled here in run *id*", "Stopped here in run *id*" when the budget stopped the run, "Running here in run *id*", or, in a quiet colour, "Not reached in run *id*". Unless the step wasn't reached, the card shall also show **See what went in and out ›**, which opens the run's page. The card shall close with its ✕ or Esc, and the strip's ✕ shall remove it with the run.

## Examples

- Given a finished run that visited `read`, `draft` and `done`, when the person picks `draft`, then the card says "✓ Ran in run 01jd8q" and offers **See what went in and out ›**.
- Given a run that failed in `draft`, then the card for `draft` says "✕ Failed here in run 01jd8q".
- Given a run that visited `draft` three times, then its card says "Ran 3 times in run 01jd8q".
- Given a run that is waiting in `review`, then the card for `review` says "Needs you here in run 01jd8q".
- Given the run never reached `done`, then the card for `done` says "Not reached in run 01jd8q" and has no link.
- Given the person presses **See what went in and out ›**, then the run's page opens.
- Given no run is shown, then picking a step docks no card.
