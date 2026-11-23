# studio.agent-choice-saved-signal

- Status: draft
- Since: unreleased
- Source: HAL-15500 (checklist 3.8, the run controls' confirm-again Callout); microcopy 23.4 "File changed, run controls"; `studio.agent-placement-choices`

When a Where it runs choice is saved, On this computer for the file the person was warned about or the sandbox, the Studio app's agents host shall tell every page subscribed to it, as it does for a change to the workspace's files, so a page that shows whether an agent's choice is on hold follows a confirm made on the agent's own page. It shall not tell them when nothing was saved because the file changed since the warning. A page that stopped its subscription shall not be told.

## Examples

- Given a workflow page subscribed to the agents host, when the person confirms On this computer for *Writer* on Writer's page, then the workflow page is told and reads Writer's choice again.
- Given the same page, when the person puts *Writer* back in its sandbox, then the page is told.
- Given *Writer*'s file changed after the warning opened, when the person confirms, then nothing is saved and no page is told.
- Given a page that stopped its subscription, when a choice is saved, then it isn't told.
