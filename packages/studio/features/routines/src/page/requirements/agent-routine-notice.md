# routines.page.agent-routine-notice

- Status: draft
- Since: unreleased
- Source: HAL-17816; C2 option (a) on HAL-12374 (board, 24 Nov); C52 claim 1.6; `routines.page.cant-run`, `routines.when.when-card`, `routines.starts.starts-card`

While a routine starts an agent rather than a workflow, the routine page shall show the notice "Halonic can't run an agent on its own yet, only as a step in a workflow. This routine won't start until it runs a workflow." at the top of its column, on the Schedule and Runs views alike, with a **Pick what it runs** button that shows the Schedule view and gives the Starts card's picker the focus (on a phone, opens its sheet). **Run now** and the When card's **Runs on its own** switch shall stay focusable but unavailable, described by the notice, whether the routine is on or off. The agent stays in the Starts picker, and the notice changes nothing in the routine's file. A routine that starts a workflow shall show no such notice, and its Run now and Runs on its own work as before.

## Examples

- Given *Daily*, which starts the agent *Analyst*, then the page says "Halonic can't run an agent on its own yet, only as a step in a workflow. This routine won't start until it runs a workflow." with **Pick what it runs**, and Run now and Runs on its own are unavailable and described by that sentence; pressing Run now starts nothing.
- Given the same page on its Runs view, when the person presses **Pick what it runs**, then the Schedule view shows and the Starts picker has the focus.
- Given *Daily*, which starts the workflow *Briefing*, then there is no notice, and Run now and Runs on its own are available.
