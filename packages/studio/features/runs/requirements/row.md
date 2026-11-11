# runs.row

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8); [ux-checklists-t8-t9](/HAL/issues/HAL-1360#document-ux-checklists-t8-t9) revision 10, 1.2; microcopy revision 94, 9.7 Row line and 15.2 (HAL-751)

The Runs list shall show in each row the run's status chip, its short id, what ran, and one line under it, which is never empty and says what the What column of `halonic runs` says. The chip shall read Running, Needs you, Waiting, Done, Failed, Stopped · budget, Stopped or Couldn't try, and only Running and Needs you shall have a dot. The line shall name the step a running run is in; what a waiting run waits for: an approval, several approvals, a wait step by its description, a child run by its short id, or a time; for a finished run, "Sent nothing" when it made no tool call, then its estimated cost, else the step it finished in; the failed banner's first sentence for a failed run; and where and after how long a run stopped at its budget or was cancelled, with its cost. The cost shall name the calls without a price, and a run with no priced call shall show no amount.

## Examples

- Given a run running in the step Draft,
  when its row is shown,
  then the chip reads Running with a dot, and the line "In Draft".
- Given a run with two open approvals,
  when its row is shown,
  then the chip reads Needs you with a dot, and the line "Waiting for 2 approvals".
- Given a run at the wait step "Approve this reply?",
  when its row is shown,
  then the line reads "Waiting for you: Approve this reply?".
- Given a run waiting for a timer due at 14:00 today,
  when its row is shown,
  then the chip reads Waiting, with no dot, and the line "Waiting until 14:00".
- Given a finished run without a tool call that cost €0.004,
  when its row is shown,
  then the line reads "Sent nothing · estimated cost €0.004".
- Given a finished run with tool calls that cost €0.03 and made 2 calls without a price,
  when its row is shown,
  then the line reads "Estimated cost €0.03 (+2 calls without a price)".
- Given a finished run on the test model with tool calls,
  when its row is shown,
  then the line names the step it finished in, and no amount.
- Given a run cancelled in the step Draft after 3 minutes,
  when its row is shown,
  then the chip reads Stopped, and the line "Cancelled in Draft after 3 min".
