# runs.run-view.receipt-summary

- Status: active
- Since: 0.1.0
- Source: ux-checklists-t8-t9 (HAL-1360) part 1, 1.9; microcopy (HAL-751) 15.2 summary line; cli-output 3.4 "What it sent"; "Running in" and the receipt's heading are a team decision under HAL-2282 (HAL-1301)

The run page shall show a receipt above Every step whose first line says how the run stands, then what it sent, then how often it asked the user, then its estimated cost, in the words of the CLI's receipt: "Finished in 2 min", "Waiting in Review", "Failed in Review after 1 min", "Budget reached in Draft reply after 3 min" or "Cancelled in Draft reply after 3 min", then one part per verb it did in call order, "may have …" for a call that broke off, "sent nothing" only for a run that made no tool call, and "asked you once". While the run is live, "so far" shall follow the last part it sent, once. A run with no priced call shall have no cost part, never "€0.00".

## Examples

- Given a finished run that took 2 min, sent 2 emails and 2 invites, saved 1 Drive file and cost €0.03,
  then the summary line reads "Finished in 2 min · sent 2 emails and 2 invites · saved 1 Drive file · estimated cost €0.03".
- Given a run waiting in Review that has sent 1 email and saved 1 Drive file,
  then the summary line reads "Waiting for your approval in the step Review · sent 1 email · saved 1 Drive file so far".
- Given a failed run whose last call to a sending tool broke off,
  then the summary line has "may have saved 1 Drive file" after what it sent.
- Given a finished run that made no tool call and asked the user once,
  then the summary line reads "Finished in 2 min · sent nothing · asked you once".
