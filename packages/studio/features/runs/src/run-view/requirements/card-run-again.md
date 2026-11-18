# runs.run-view.card-run-again

- Status: draft
- Since: unreleased
- Source: HAL-12412 (UX check R10 of HAL-12390)

Where the run card is given a way to start runs, the failed banner of its receipt shall offer **Run again** as the run page's does, and say why it didn't start above the banner when it fails. Where it is given a way to open Models, the banner shall offer **Open Models** as the run page's does.

## Examples

- Given a run that failed because Ollama wasn't running, and a card that can start runs and open Models,
  when the card shows the run,
  then its banner says "Start Ollama, then run again." with **Run again** and **Open Models**, and **Run again** starts the workflow with the logged input and opens the new run.
- Given the same run and a card given neither,
  when the card shows the run,
  then its banner has neither **Run again** nor **Open Models**.
