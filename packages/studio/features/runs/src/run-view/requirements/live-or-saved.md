# runs.run-view.live-or-saved

- Status: active
- Since: 0.1.0
- Source: save model 2.3 (HAL-1102, HAL-3236 task 2); [req-runs](/HAL/issues/HAL-110#document-req-runs); wording by Elena with Sofia, a team decision under HAL-2282 (HAL-5175); HAL-4966 condition 2; `events.run-started-version` (HAL-5173)

The run view shall show for each run, in one line of secondary text under the run's title (not a badge), what it ran, from the `version` its `run.started` records:

- a run on the live version: "Ran the live version from _time_.", where _time_ is when the version was made, not when a file changed: the time alone for a version made today ("10:42"), else the day and the time ("10 Nov, 10:42"). The version's commit shows only in the line's tooltip, as "Commit 3f2a1c9";
- a run on the saved files (a test run): "Ran the saved files.", with no commit;
- a run whose log records neither (runs from before the log recorded it): "Version not recorded.", as plain text, not an error, with no icon.

The line shall never say "changed since" a date, and no wording shall suggest that saved changes don't run: for v0.1 a live run's programs (stdio connectors, harness agents) still read the saved files on disk (HAL-4966 condition 2, follow-up HAL-4975).

## Examples

- Given run r1 started today by a routine on the version made at 10:42,
  when the person opens r1,
  then the line under its title reads "Ran the live version from 10:42." and its tooltip shows the version's commit.
- Given run r3 started on 11 Nov by a routine on the version made on 10 Nov at 10:42,
  when the person opens r3,
  then the line reads "Ran the live version from 10 Nov, 10:42."
- Given run r2 is a test run,
  when the person opens r2,
  then the line reads "Ran the saved files." and no commit is shown.
- Given run r4 from before the run log recorded the version,
  when the person opens r4,
  then the line reads "Version not recorded.", without an icon or error colour.
