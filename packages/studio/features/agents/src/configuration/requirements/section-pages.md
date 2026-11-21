# agents.configuration.section-pages

- Status: draft
- Since: unreleased
- Source: HAL-14029; flow-agents 5.1; flow-routines 2.3; `shell.item-page-sections`

The agent's Configuration shall list each section that other features add to the agent's page, in their order, as a page after the agents feature's own pages, named by the section's title, and that page shall draw only that section.

## Examples

- Given the routines feature adds the Triggers section on agents, when the person opens the agent's Configuration, then its pages read Behaviour, Model, Harness, Tools, Subagents, Agent steps, Triggers, and picking Triggers shows the routines that start the agent and **Add trigger**.
