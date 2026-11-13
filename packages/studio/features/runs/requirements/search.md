# runs.search

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8), HAL-8395; ux-checklists-t8-t9 (HAL-1360) revision 10, 1.1

The Ctrl K palette shall find runs by their short id, with or without "run" or "#" in front, and by their workflow's name, among the newest 500 runs, at most 8 at a time, those whose short id starts with the words first. A run hit shall read "Run 01jd8q · Support reply", with "Run · acme" as its detail and the run's row line under it, and shall open the run's page. Words that match no run shall find nothing.

## Examples

- Given a run whose id ends in 01JD8Q,
  when someone types "run 01jd8q" in Ctrl K,
  then the run is found as "Run 01JD8Q · Support reply".
- Given the same run,
  when someone types "#01jd",
  then it is found too.
- Given runs of Support reply and of Morning brief,
  when someone types "brief",
  then only the Morning brief runs are found.
- Given no run matches,
  when someone types "zzz",
  then nothing is found.
