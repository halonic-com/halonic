# runs.app-list

- Status: active
- Since: unreleased
- Source: HAL-18624 (Runs app build), design revision 3 on HAL-18594 (Runs: screens and flows), approved by the board on 25 Nov 14:48 UTC; task HAL-18725

The Runs app's list shall show the heading "Runs" with "N running" while runs are running, and under it the summary line "Today: 9 runs · 2 failed · €0.11", with one amount per currency, or "No runs yet today." when none started today, followed by a **Costs ›** button that opens the Costs view. It shall show the runs in the groups of `runs.run-groups`, each group under its own heading. Each row shall show the run's status chip, what ran, its line and where it runs, and its cost at the end: money in its own currency, or tokens for an agent on a subscription, followed by "so far" while the run is going. A failed row shall keep its cost and show its failure by its status chip, and the run open in the pane shall be the list's current row. A click or Enter on a row shall open its run.

## Examples

- Given a running run that has cost €0.04 so far, a failed run of €0.07 and a subscription agent's run of 1,200 tokens, all today,
  when the list is shown,
  then the heading says "1 running", the summary says "Today: 3 runs · 1 failed · €0.11", and the rows end with "€0.04 so far", "€0.07" and "1,200 tokens".
- Given no run started today,
  when the list is shown,
  then the summary says "No runs yet today."
