# agents.map.layout-by-side

- Status: draft
- Since: unreleased
- Source: HAL-13180; flow-agents 6 (K7, U13); UX checklist 9.9; accessibility pass 6.3

The agents feature shall show an agent page's Flow view as the agent map, with the agent in the centre card by its avatar and name and with its agent steps, on the left what brings it work (the workflows that run it, each with the steps that do, and the agents that hand it work), below what it can use (its skills, knowledge and connectors by name, three a row), and on the right who it hands work to (its subagents), each side a group named by its heading, in the reading order left, centre, below, right.

## Examples

- Given the agent "Mail triage" with the agent step "classify", the subagent "Writer", the skill "Tone" and the connector "Acme mail", run by the workflow "Support reply" in 2 steps and handed work by "Sorter", when its page shows Flow, then the left group "What brings it work" holds "Support reply" and "Sorter", the centre card "Mail triage" and "classify ›", the group "What it can use" "Tone" and "Acme mail", and the group "Who it hands work to" "Writer".
- Given the workflow "Support reply" runs "Mail triage" in the steps `triage` and `draft`, then its card is named "Workflow Support reply, uses Mail triage in triage and draft".
- Given a file of the agent's hub changes, then the map shows it without a skeleton.
- Given the map's parts can't be read, then it says "Couldn't show Mail triage's map", the reason and **Open as file**, which opens the agent's file.
