# agents.map.workflow-card-steps

- Status: draft
- Since: unreleased
- Source: HAL-13180; flow-agents 6 ("one card per workflow naming the steps that call it"); microcopy 19.7 (agent map card); UX checklist 9.9 card names

The agents feature shall show, on each workflow card of the agent map, the ids of the workflow's steps that run the agent in the workflow's order, as the card's detail line joined by commas, and shall name the card "Workflow" with the workflow's name, then "uses" with the agent's name "in" those steps, the last two joined by "and".

## Examples

- Given the workflow "Support reply" runs "Mail triage" in its step `draft`, then its card shows "draft" and is named "Workflow Support reply, uses Mail triage in draft".
- Given it runs "Mail triage" in `sort`, `check` and `reply`, in that order, then its card shows "sort, check, reply" and is named "Workflow Support reply, uses Mail triage in sort, check and reply".
