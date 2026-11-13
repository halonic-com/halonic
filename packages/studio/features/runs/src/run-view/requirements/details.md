# runs.run-view.details

- Status: active
- Since: 0.1.0
- Source: ux-checklists-t8-t9 (HAL-1360) part 1, 1.11; microcopy (HAL-751) 15.2, cost words; the "None" and "still going" rows are a team decision under HAL-2282 (HAL-1301)

The run page shall show a Details column beside Every step with side-label rows in this order: Started by, Started, Took, Model calls and tokens, Estimated cost, Ran on, then the run's id in subtle text, last. Took shall be left out while the run is live. Model calls and tokens shall read "1,204 in · 312 out", and "None" for a run that made no model call. Estimated cost shall use the cost words of the run's line without their lead-in ("€0.03 (+2 calls without a price)", "3 calls without a price") and shall be left out when no call had a price, never "€0.00". Ran on shall say what the run's log says it ran, as the line under the title does, and shall wait until the log is read.

## Examples

- Given a finished run started with Run that took 2 min 10 s, used 1,204 input and 312 output tokens and cost €0.03,
  then Details reads Started by "You, with Run", Started "today 10:40", Took "2 min 10 s", Model calls and tokens "1,204 in · 312 out" and Estimated cost "€0.03".
- Given a live run that made no model call,
  then Details has no Took row, Model calls and tokens reads "None" and there is no Estimated cost row.
- Given a run with 3 calls and no price,
  then Estimated cost reads "3 calls without a price".
