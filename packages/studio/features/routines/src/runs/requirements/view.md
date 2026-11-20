# routines.runs.view

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 14); flow-routines 3.1 and 3.9; microcopy 12.3

The routine page shall have the tabs Schedule and Runs, with the Runs tab showing the number of runs that wait for a person in amber, else a still dot while one runs; the Runs view shall list **Now** (runs that are running or wait for a person, then one quiet row for queued times) and **Earlier** (the other runs and the times that didn't start, newest first), each run with its status, short id, what started it and when, named for screen readers as "Run *id*, *outcome*. Started: *how*, *time*." (HAL-14241), and opening the run's page; a time that didn't start shall be one quiet row that says the times and why, which isn't a link, and a view with nothing to show shall say "No runs yet." with when the routine runs next, or "Press Run now to start one."

## Examples

- Given a run "9hv3bw" that is done, started by the schedule at 08:00 today, then Earlier has a row "Done 9hv3bw On schedule 08:00", named "Run 9hv3bw, done. Started: On schedule, 08:00.", that opens that run.
- Given a running run and a run that waits, then both are under Now and the Runs tab says "1 needs you".
- Given a skipped range "busy" at 08:00 Tue, then Earlier has the quiet row "08:00 Tue: the last run was still busy" with no button.
- Given three skipped times from 07:00 to 09:00 on one day, then the row reads "07:00 to 09:00 Tue: …".
- Given queued times that are 99 long, then Now has the row "… 99 times waiting to start, one after another", read as "Queued, …".
- Given no runs and a schedule that is on, then the view says "No runs yet." and "It runs next on Fri 6 Nov at 07:30, or press Run now."
- Given the host can't read the runs, then the view says "Couldn't load runs" with **Try again**.
