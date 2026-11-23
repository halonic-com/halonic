# agents.confirm-again.run-controls

- Status: draft
- Since: unreleased
- Source: HAL-15500, HAL-1709 (ux-checklists-sandbox 3.8, revision 4); microcopy 23.4 "File changed, run controls" (revision 130, C588); `agents.configuration.where-it-runs`

The agents feature shall give a page's run controls the confirm-again Callout: for each agent the page runs whose On this computer choice is on hold, in the page's order, one attention Callout saying "*Writer* runs in the sandbox until you confirm again: its file changed since you chose On this computer." with **Review and confirm**, which opens the agent's page at Configuration › Harness, where Where it runs holds the warning. The Callout shall not make Run or any other control unavailable. When the choice is confirmed again or set back to the sandbox, on any page, the Callout shall go without the page being opened again. An agent that isn't on hold, whose choice can't be read, or where Studio can't choose (the browser) shall get no Callout. Where the page can't open an agent, the Callout shall have no button.

When an agent's page is opened with the step `where-it-runs` (`openItem(agent, { step: WHERE_IT_RUNS_STEP })`), the agents feature shall show its Configuration on the Harness page, and again each time it is asked while the page is open.

## Examples

- Given *Support reply* runs *Writer* in Claude Code and Writer's choice is on hold, then the page shows "Writer runs in the sandbox until you confirm again: its file changed since you chose On this computer." with **Review and confirm**, and Run stays available.
- Given the same page, when the person presses **Review and confirm**, then Writer's page opens at Configuration › Harness.
- Given the same page, when the choice is confirmed again on Writer's page, then the Callout goes.
- Given two agents on hold, then there are two Callouts, in the page's order.
- Given Writer's choice can't be read, or Studio can't choose where agents run, then there is no Callout.
- Given Writer's page is open on Flow, when it is opened at `where-it-runs`, then it shows Configuration › Harness.
