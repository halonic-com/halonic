# workflows.page.confirm-again

- Status: draft
- Since: unreleased
- Source: HAL-15500, HAL-1709 (ux-checklists-sandbox 3.8, revision 4); microcopy 23.4 "File changed, run controls"; `agents.confirm-again.run-controls`, `workflows.page.cant-run`

When a step of the workflow runs an agent in a program of its own (Claude Code or Codex) and that agent's On this computer choice is on hold, the workflow page shall show the confirm-again Callout of `agents.confirm-again.run-controls` for it under the page header, below the can't-run Callout when that shows too, once per agent however many steps run it, and **Run** shall stay available. **Review and confirm** shall open that agent's page at Where it runs. A workflow none of whose program agents is on hold shall show no such Callout.

## Examples

- Given *Support reply* whose steps *Draft* and *Polish* run *Writer* in Claude Code, and Writer's choice is on hold, then the page shows one confirm-again Callout for Writer and Run is available.
- Given the same workflow and a sandbox check that says `bubblewrap-missing`, then the can't-run Callout comes first and the confirm-again Callout after it.
- Given the same workflow, when the person presses **Review and confirm**, then Writer's page opens at `where-it-runs`.
- Given Writer's choice is On this computer and not on hold, then there is no confirm-again Callout.
