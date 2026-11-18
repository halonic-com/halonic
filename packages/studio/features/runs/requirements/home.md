# runs.home

- Status: active
- Since: unreleased
- Source: HAL-1301 (T8), HAL-8395; ux-checklists-t8-t9 (HAL-1360) revision 10, 1.1; ux-checklists-t2-t6-t7 (HAL-1323) 1.9 and 1.15; microcopy revision 94, 3.3 and 3.4 (HAL-751); HAL-11115; ux-check L14 (HAL-12363), microcopy revision 109 (HAL-751), HAL-12371

The Home screen shall show a Recent runs section with the latest five runs, running and needs-you runs above finished ones even when older, each with its workflow's name, the line the Runs list shows under What ran, and its status chip. A finished test run shall be left out. While a run is running, the heading shall read "*N* running". Without runs the section shall say "No runs yet. When an agent or workflow runs, you'll see it here." and, under it in muted text, so Home never ends on nothing, how to start one with the first workflow in the Workflows list's order. Where a workflow's page has **Run** (an engine), the note shall be "Studio shows what your agents are doing and lets you read each run. To start one, open *Weekly report* in Workflows and press **Run**." with *Weekly report* the workflow's name as a link that opens its page and **Run** in bold; a workspace with no workflow shall say "This workspace has no workflows yet. Add one in Workflows, then press **Run** on it." instead, and while the workflow names are loading or can't be read the note shall say "a workflow" in place of the name (HAL-12371). Elsewhere, as in a served Studio, the note shall be "Studio shows what your agents are doing and lets you read each run. To start one, use the command line: `halonic run *name*`." with the command in code style and *name* the workflow as `halonic run` takes it; a workspace with no workflow shall say "This workspace has no workflows yet. Add one in Workflows, then start it from the command line." instead, and while the names are loading or can't be read the command shall have no name (HAL-10128). In the Acme sample, where a run starts from the Inbox, the section shall say only "No runs yet. Start one from the Inbox, and it shows up here.", with no note under it; before the first list loads it shall show its skeleton, and when that load fails the section's error with Try again. A row shall open its run in the active tab. On a phone, **See all runs** shall follow the rows.

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
- Given the Acme sample with no runs,
  when Home shows Recent runs,
  then the section says "No runs yet. Start one from the Inbox, and it shows up here." and has no command line note.
- Given a failed run,
  when Home shows Recent runs,
  then its second line says what the Runs list says: "Support reply failed in the step Draft."
- Given a phone,
  when Home shows runs,
  then "See all runs" follows the rows and opens the Runs place.
