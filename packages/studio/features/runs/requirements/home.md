# runs.home

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8), HAL-8395; ux-checklists-t8-t9 (HAL-1360) revision 10, 1.1; ux-checklists-t2-t6-t7 (HAL-1323) 1.9 and 1.15; microcopy revision 94, 3.3 and 3.4 (HAL-751)

Home shall show a Recent runs section with the latest five runs, running and needs-you runs above finished ones even when older, each with its workflow's name, the line the Runs list shows under What ran, and its status chip. A finished test run shall be left out. While a run is running, the heading shall read "*N* running". Without runs the section shall say "No runs yet. When an agent or workflow runs, you'll see it here."; before the first list loads it shall show its skeleton, and when that load fails the section's error with Try again. A row shall open its run in the active tab. On a phone, **See all runs** shall follow the rows.

## Examples

- Given six finished runs and an older run that needs you,
  when Home shows Recent runs,
  then the run that needs you is first, followed by the four newest finished runs.
- Given a run that is running,
  when Home shows Recent runs,
  then the heading reads "1 running".
- Given a finished test run,
  when Home shows Recent runs,
  then the test run isn't listed.
- Given no runs,
  when Home shows Recent runs,
  then the section says "No runs yet. When an agent or workflow runs, you'll see it here."
- Given a failed run,
  when Home shows Recent runs,
  then its second line says what the Runs list says: "Support reply failed in the step Draft."
- Given a phone,
  when Home shows runs,
  then "See all runs" follows the rows and opens the Runs place.
