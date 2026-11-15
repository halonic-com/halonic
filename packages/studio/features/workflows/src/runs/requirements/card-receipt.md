# workflows.runs.card-receipt

- Status: draft
- Since: 0.1.0
- Source: HAL-8395 (T8 PR 6); ux-checklists-t8-t9 (HAL-1360) part 1, 1.1; UX 3.7; state R15

When the person picks a run in the workflow's Runs view, the run card shall show the run's receipt at card width, the same summary line and sections as the run page's receipt, read from the run's log; while the log is read it shall show a skeleton named "Loading the run", and when it can't be read it shall say "Couldn't read this run's log" and why.

## Examples

- Given a finished run, then its card shows the receipt's summary line, "Finished in" and how long it took.
- Given a run whose log can't be read, then its card says "Couldn't read this run's log" and the run's status and **Open the run log** stay.
- Given a run whose log is still being read, then its card shows a skeleton named "Loading the run".
