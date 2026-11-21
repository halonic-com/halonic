# routines.runs.view

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 14); flow-routines 3.1 and 3.9 (rev 23, refused starts, C533-5 on HAL-15068; their next step and the pointer to Run now, C553 rows 9 and 10 on HAL-15228; long words, C551 F4 on HAL-15247); microcopy 12.3 (rev 124) and 19.8

The routine page shall have the tabs Schedule and Runs, with the Runs tab showing the number of runs that wait for a person in amber, else a still dot while one runs; the Runs view shall list **Now** (runs that are running or wait for a person, then one quiet row for queued times) and **Earlier** (the other runs and the times that didn't start, newest first), each run with its status, short id, what started it and when, named for screen readers as "Run *id*, *outcome*. Started: *how*, *time*." (HAL-14241), and opening the run's page; a time that didn't start shall be one quiet row that says the times and why, which isn't a link and breaks a long word rather than widen the panel, with a refused start reading "*times*: couldn't start. *reason* *next step*" (the refusal's own sentence and its next step when it has one, as the Run panel says them, with "Press Run now to see the command." as the step when it leads to a command, which only the Run panel shows, or "Halonic ran into a problem it can't explain yet. Press Run now to see the details.", since **Run now** shows the same refusal with **Copy details**) and named "Couldn't start at *time*. *reason* *next step*" ("from *range*" for several times), not announced, and a view with nothing to show shall say "No runs yet." with when the routine runs next, or "Press Run now to start one."

## Examples

- Given a run "9hv3bw" that is done, started by the schedule at 08:00 today, then Earlier has a row "Done 9hv3bw On schedule 08:00", named "Run 9hv3bw, done. Started: On schedule, 08:00.", that opens that run.
- Given a running run and a run that waits, then both are under Now and the Runs tab says "1 needs you".
- Given a skipped range "busy" at 08:00 Tue, then Earlier has the quiet row "08:00 Tue: the last run was still busy" with no button.
- Given three skipped times from 07:00 to 09:00 on one day, then the row reads "07:00 to 09:00 Tue: …".
- Given a start refused at 08:01 Tue with "The input has no field mail, which the step Read the email reads.", then Earlier has the quiet row "08:01 Tue: couldn't start. The input has no field mail, which the step Read the email reads.", named "Couldn't start at 08:01 Tue. The input has no field mail, which the step Read the email reads."
- Given a start refused at 08:01 Tue with "Acme is already running in another Halonic on this computer." and the next step "Stop that one, then try again.", then its row reads "08:01 Tue: couldn't start. Acme is already running in another Halonic on this computer. Stop that one, then try again.", and its name ends the same.
- Given a start refused at 08:01 Tue with "This window can't run Briefing." and a next step that leads to a command, then its row reads "08:01 Tue: couldn't start. This window can't run Briefing. Press Run now to see the command.", and its name ends the same.
- Given a start refused at 08:01 Tue with "The input has no field attachments_from_the_customer_support_mailbox_forwarding_rule.", then on a 390 px wide window its row breaks that name across lines and the Runs panel doesn't scroll sideways.
- Given a start refused without a sentence, then its row ends "couldn't start. Halonic ran into a problem it can't explain yet. Press Run now to see the details."
- Given queued times that are 99 long, then Now has the row "… 99 times waiting to start, one after another", read as "Queued, …".
- Given no runs and a schedule that is on, then the view says "No runs yet." and "It runs next on Fri 6 Nov at 07:30, or press Run now."
- Given the host can't read the runs, then the view says "Couldn't load runs" with **Try again**.
