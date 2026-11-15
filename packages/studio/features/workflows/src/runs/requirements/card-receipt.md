# workflows.runs.card-receipt

- Status: draft
- Since: 0.1.0
- Source: HAL-8395 (T8 PR 6); ux-checklists-t8-t9 (HAL-1360) part 1, 1.1; UX 3.7; state R15

When the person picks a run in the workflow's Runs view, the run card shall show the run's receipt at card width, read from the run's log: the banner when the run needs attention, the same summary line and sections as the run page's receipt, then Every step with **Show the run log**; while the log is read it shall show a skeleton named "Loading run" and the run's number, with the header and no status chip, and when it can't be read it shall say "Couldn't load run" and the run's number, why, and **Try again**, inside the card with the header and ✕ still working; its footer link shall say **Show the run log** once the receipt shows and **Open the run log** where it doesn't.

## Examples

- Given a finished run, then its card shows the receipt's summary line, "Finished in" and how long it took, and Every step under it.
- Given a run that waits for the person, then its card shows the "Waiting for you" banner with **Review in Inbox**.
- Given a run whose log can't be read, then its card says "Couldn't load run 01jd8q" and why, with **Try again**, and the run's status and **Open the run log** stay; **Try again** reads the log again.
- Given a run whose log is still being read, then its card shows a skeleton named "Loading run 01jd8q" and no status chip.
