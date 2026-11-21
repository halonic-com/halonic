# agents.map.clicks

- Status: draft
- Since: unreleased
- Source: HAL-13180; flow-agents 6 "Clicks on the map"; UX checklist 9.9

When a card of the agent map is pressed, the agents feature shall open what it names: an agent step or a subagent as a stacked card over the map, a workflow or an agent that hands it work as its own page, and a skill, knowledge source or connector in Library on its list; the centre card's name shall open nothing, and a card the app can't open shall be text, not a button.

## Examples

- Given the map of "Mail triage", when the agent step "classify ›" is pressed, then a card "classify" opens over the map.
- Given the map of "Mail triage", when the subagent "Writer" is pressed, then a card "Writer" opens over the map with the path "Acme Mail › Mail triage › Writer".
- Given the map of "Mail triage", when the workflow "Support reply" is pressed, then the page of the workflow "support-reply" opens.
- Given the map of "Mail triage", when "Sorter", who hands it work, is pressed, then the page of the agent "sorter" opens.
- Given the map of "Mail triage", when the skill "Tone" is pressed, then Library opens on its skills.
- Given an app that can't open pages, then the workflow "Support reply" is text, not a button.
