# runs.run-view.receipt-ending

- Status: active
- Since: unreleased
- Source: run page notes for a run that ended on a rejection (HAL-14586), a team decision under HAL-2282 (HAL-14592)

Directly under the receipt's summary line, the run page shall name the ending a completed run reached, "Ending: _ending_", where _ending_ is the first line of the description of the final state the run ended in, else that state's id. It shall show only for a completed run of a workflow with more than one final state: a workflow with one ending keeps "Finished" alone (HAL-11699), and a failed, stopped or cancelled run already says where it stopped. The run's badge stays "Done" whatever the ending.

## Examples

- Given a Support reply run whose person rejected the reply, ending in the final state `not-replied` described "Finished without the reply",
  when its page is shown,
  then the line under "Finished in 8 s · sent nothing · asked you once" reads "Ending: Finished without the reply".
- Given a run of a workflow whose only final state is `done`,
  then the receipt has no Ending line.
- Given a run of the same Support reply workflow that failed in the step Draft,
  then the receipt has no Ending line.
