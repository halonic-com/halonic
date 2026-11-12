# runs.run-page

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8); [ux-checklists-t8-t9](/HAL/issues/HAL-1360#document-ux-checklists-t8-t9) revision 10, 1.1, 1.5, 1.6 and 1.8; [states](/HAL/issues/HAL-5896#document-states) R13, R14, R18, R21, R22 and R24; microcopy revision 94, 15.2 (HAL-751)

When a run is opened from the Runs list or from another run, the Studio shall show the run page in the active tab, one run per tab, with the run's kind and workflow, the `h1` "Run" and its short id, its status chip, and when it started, then how long it took, or "updates live" while the run is live. The run page shall show one banner only when the run needs attention: amber with Review in Inbox when it waits for the user's approval or at a wait step, neutral when it waits for a time or a child run, with Open run for a child run, R24's general banner when it failed, the budget banner when it stopped at its budget, and a plain note, not a banner, when it was cancelled. While the run is loading the page shall show its `h1` and skeleton bars; when the run can't load, "Couldn't load run" with the reason and Try again; when the run isn't in the workspace, "This run isn't in this workspace any more." with Go to Runs; and when a later load fails, the engine's line under the header, keeping what the page showed.

## Examples

- Given a run that started today at 10:40 and is still running,
  when its page is shown,
  then the header reads "Run · Support reply", "Run 01JD8Q", the chip Running and "today 10:40 · updates live", with no banner.
- Given a run with one open approval in the step Send,
  when its page is shown,
  then the amber banner reads "Waiting for your approval in the step Send. Nothing runs until you decide." with Review in Inbox.
- Given a run waiting for its child run 7K2M9P of Verify,
  when its page is shown,
  then the neutral banner reads "Waiting for child run 7K2M9P (Verify)." with Open run 7K2M9P.
- Given a run cancelled in the step Classify,
  when its page is shown,
  then the chip reads Stopped and the plain note "Support reply was cancelled in the step Classify. Nothing after it ran.".
- Given a run that failed in the step Draft with the message "Model refused",
  when its page is shown,
  then the danger banner reads "Support reply failed in the step Draft. Halonic can't tell the cause yet: Model refused.".
- Given a run id that isn't in the workspace,
  when its page is shown,
  then it reads "This run isn't in this workspace any more." with Go to Runs.
