# routines.page.confirm-again

- Status: draft
- Since: unreleased
- Source: HAL-16665, HAL-15500, HAL-1709 (ux-checklists-sandbox 3.8, revision 4); microcopy 23.4 "File changed, run controls"; `agents.confirm-again.run-controls`, `routines.page.cant-run`

When what a routine starts runs an agent in Claude Code or Codex (`programAgents`) and the page has **Run now**, the routine page shall show the view the Agents feature gives for those agents (`RoutineRunAgentsService`), on the Schedule and Runs views alike, below the can't-run Callout when that shows too. For an agent whose On this computer choice is on hold that view is the confirm-again Callout of `agents.confirm-again.run-controls`, once per agent however many steps run it, and **Review and confirm** opens that agent's page at `where-it-runs`. **Run now** shall stay available for it. A routine that runs no agent in a program of its own, or a window without the Agents feature, shall show no such view.

## Examples

- Given *Daily summary*, whose workflow runs *Writer* in Claude Code, and Writer's choice is on hold, then the page shows the confirm-again Callout for Writer and Run now is available.
- Given the same routine and a sandbox check that says `bubblewrap-missing`, then the can't-run Callout comes first and the confirm-again Callout after it.
- Given the same page, when the person presses **Review and confirm**, then Writer's page opens at `where-it-runs`.
- Given a routine whose workflow only uses Halonic's own agents, then there is no such Callout.
