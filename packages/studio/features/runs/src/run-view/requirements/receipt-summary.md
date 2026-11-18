# runs.run-view.receipt-summary

- Status: active
- Since: unreleased
- Source: ux-checklists-t8-t9 (HAL-1360) part 1, 1.9; microcopy (HAL-751) 15.2 summary line; cli-output 3.4 "What it sent"; "Running in" and the receipt's heading are a team decision under HAL-2282 (HAL-1301)

The run page shall show a receipt above Every step whose first line says how the run stands, then what it sent, then how often it asked the user, then its estimated cost, in the words of the CLI's receipt: "Finished in 2 min", "Waiting for your approval in the step Review", "Failed in Review after 1 min", "Budget reached in Draft reply after 3 min", "Cancelled in Draft reply after 3 min" or, for a Try it or Test run that ended at a step it couldn't try, "In Draft reply", then one part per verb it did in call order, "may have …" for a call that broke off, no sent part for a run that made no tool call (never "Sent"), and "asked you once", which only a run that has ended shows, as a receipt. A run that waits for the user shall open with "Waiting for you · started 12:25" (the clock time when it started today, else "yesterday 10:40" or "Fri 6 Nov 10:40") and shall not repeat the banner's sentence (HAL-11839). While the run is live, "so far" shall follow the last part it sent, once. A run with no priced call shall have no cost part, never "€0.00".

## Examples

- Given a finished run that took 2 min, sent 2 emails and 2 invites, saved 1 Drive file and cost €0.03,
  then the summary line reads "Finished in 2 min · sent 2 emails and 2 invites · saved 1 Drive file · estimated cost €0.03".
- Given a run waiting in Review that has sent 1 email and saved 1 Drive file,
  then the summary line reads "Waiting for you · started 12:25 · sent 1 email · saved 1 Drive file so far", and the banner above holds the sentence about the approval.
- Given a run that started today at 12:25, asked the user once and still waits,
  then the summary line reads "Waiting for you · started 12:25", with no "asked you once".
- Given a failed run whose last call to a sending tool broke off,
  then the summary line has "may have saved 1 Drive file" after what it sent.
- Given a finished run that made no tool call and asked the user once,
  then the summary line reads "Finished in 2 min · asked you once".
