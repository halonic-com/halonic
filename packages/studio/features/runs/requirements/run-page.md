# runs.run-page

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8); ux-checklists-t8-t9 (HAL-1360) revision 10, 1.1, 1.5, 1.6 and 1.8; states (HAL-5896) R13, R14, R18, R21, R22 and R24; microcopy revision 99, 15.2 (HAL-751)

When a run is opened from the Runs list or from another run, the Studio shall show the run page in the active tab, one run per tab, with the run's kind and workflow, the `h1` "Run" and its short id, its status chip, and when it started, then how long it took, or "updates live" while the run is live. When the run is a routine's catch-up (`trigger.catchUp`), a line under it shall say "Started at 08:12 to catch up. It was planned for 07:30 while Halonic was closed or asleep.", giving each time as a clock time for today and as the date with the clock time for another day, and adding "61 earlier times were skipped." when the catch-up rule dropped some. The run page shall show one banner only when the run needs attention: violet (the warning token, "your turn") with Review in Inbox when it waits for the user's approval or at a wait step, neutral when it waits for a time or a child run, with Open run for a child run, R24's general banner when it failed, the budget banner when it stopped at its budget, and a plain note, not a banner, when it was cancelled. While the run is loading the page shall show its `h1` and skeleton bars; when the run can't load, "Couldn't load run" with the reason and Try again; when the run isn't in the workspace, "This run isn't in this workspace any more." with Go to Runs; and when a later load fails, the engine's line under the header, keeping what the page showed.

## Examples

- Given a run that started today at 10:40 and is still running,
  when its page is shown,
  then the header reads "Run · Support reply", "Run 01jd8q", the chip Running and "today 10:40 · updates live", with no banner.
- Given a run with one open approval in the step Send,
  when its page is shown,
  then the violet banner reads "Waiting for your approval. *Reporter wants to send an email with Gmail.* Nothing is sent until you decide." with Review in Inbox.
- Given a routine run planned for 11 Nov at 07:30 that started on 12 Nov at 08:12 as a catch-up, with 61 earlier times skipped,
  when its page is shown on 14 Nov,
  then the line under the header reads "Started on 12 Nov at 08:12 to catch up. It was planned for 11 Nov at 07:30 while Halonic was closed or asleep. 61 earlier times were skipped.".
- Given a run waiting for its child run 7k2m9p of Verify,
  when its page is shown,
  then the neutral banner reads "Waiting for child run 7k2m9p (Verify)." with Open run 7k2m9p.
- Given a run cancelled in the step Classify,
  when its page is shown,
  then the chip reads Stopped and the plain note "Support reply was cancelled in the step Classify. Nothing after it ran.".
- Given a run that failed in the step Draft with the message "Model refused",
  when its page is shown,
  then the danger banner reads "Support reply failed in the step Draft. Halonic can't tell the cause yet: Model refused.".
- Given a run id that isn't in the workspace,
  when its page is shown,
  then it reads "This run isn't in this workspace any more." with Go to Runs.
