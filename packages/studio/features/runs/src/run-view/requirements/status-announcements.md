# runs.run-view.status-announcements

- Status: active
- Since: unreleased
- Source: keyboard and screen-reader check (HAL-12426) A1 and A2; microcopy 19.3 revision 115 (HAL-751); shell `shell.announcer`; the forms 19.3 doesn't list (no step, a wait for nothing named, couldn't try) by Tomas, a team decision under HAL-2282 (HAL-12456)

When the open run's status changes, the run page shall read its new state once through the shell's `announceState`, under the key `run:<run id>`, in microcopy 19.3's words, with the run's short id:

- needs you: "Run _id_ needs you. Waiting for your approval: _ask_." for an approval, where _ask_ is the banner's "_Agent_ wants to _action_" with the tool's connector in brackets when it has one; for a wait step, "Run _id_ needs you." and then the banner's own words ("Waiting for you: _description_", or "Waiting for you in the step _step_." without a description);
- running again: "Run _id_ is running again.";
- waiting, not for the person: "Run _id_ is waiting until _time_.", "Run _id_ is waiting for child run _child id_.", or "Run _id_ is waiting.";
- a finished run: "Run _id_ finished." and then, only when there is any, what it sent or saved and its estimated cost, as the receipt's summary line says them, joined by commas, never its "Finished in" part. It shall wait until the run's log has the run's end, so it is read once, whole;
- a failed run: "Run _id_ failed in the step _step_. The banner at the top says what to do.", or "Run _id_ failed. The banner at the top says what to do." for a run that never reached a step;
- stopped at its budget: "Run _id_ stopped at its budget: estimated _spent_ of _budget_.", or "Run _id_ stopped at its budget." when the cause has no figures;
- a cancelled run: "Run _id_ was cancelled in the step _step_.", or "Run _id_ was cancelled." before a step;
- couldn't try: "Run _id_ couldn't try the step _step_.".

The state the page first shows shall not be read, and neither shall the page moving on to another run.

When a status change removes the element that had focus in the page, such as **Review in Inbox** in a banner that goes, the run page shall move focus to its `h1`. Focus elsewhere, in the page or outside it, shall stay where it is.

## Examples

- Given the run page of run 650704 waiting at a wait step described "Approve this reply?" is open,
  when the run is answered in a terminal and finishes having sent nothing, on the test model,
  then the screen reader hears "Run 650704 finished." and nothing was read when the page opened.
- Given the run page of a running run is open,
  when the run asks for approval for create_note from the notes-mcp connector by Sorter,
  then the screen reader hears "Run … needs you. Waiting for your approval: Sorter wants to use create_note (notes-mcp)."
- Given focus is on **Review in Inbox**,
  when the run goes on and the banner goes,
  then focus is on the page's `h1`, "Run …".
