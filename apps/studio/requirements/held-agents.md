# studio.held-agents

- Status: draft
- Since: unreleased
- Source: HAL-16664, HAL-15500; ux-checklists-sandbox (HAL-1833) 3.8; `inbox.on-hold-row`, `studio.agent-choice-saved-signal`

Where Studio can choose where an agent runs, the Studio app shall give the Inbox's on-hold rows each agent whose On this computer choice is on hold once a routine ran it since its file changed. A routine ran it when a real run started by a routine (`trigger.routineId`) belongs to one of the agent's own routines (`<hub>/<id>`, or `@workspace/<id>` at the workspace's root) or ran a workflow that runs the agent, and started after the time the file changed; when that time isn't known, any such run counts. A run started by hand, and a test run, don't count. The agent's time is the start of the newest such run. Such a run ran in the sandbox, since the engine never lets a held agent out, so the app reads the agents host and the run history and the engine records nothing more.

An agent whose choice can't be read shall count as not on hold, as on the run controls, so one broken file never hides the other agents. When no routine has run anything, no agent's choice is read. The app shall pass on the run history's changes and the agents host's, a saved Where it runs choice included, to the rows' listeners. Without the agent host there are no held agents.

## Examples

- Given *Writer* on hold since 08:00 and the routine `acme/daily` that starts it ran at 09:00, then *Writer* is listed with 09:00.
- Given the same routine ran only at 07:00, then *Writer* isn't listed.
- Given a routine ran the workflow `acme/digest`, which runs *Writer*, after the hold, then *Writer* is listed.
- Given *Writer* on hold with no known time and any run of its routine, then *Writer* is listed.
- Given a hand-started or test run of *Writer*'s workflow, then *Writer* isn't listed.
- Given *Sorter*'s choice can't be read, then *Writer* is still listed and *Sorter* isn't.
- Given a choice is saved or a run starts, then the rows' listeners hear it.
