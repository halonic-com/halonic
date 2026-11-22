# agents.map.workflow-card-steps

- Status: draft
- Since: unreleased
- Source: HAL-13180; C618 #4 (HAL-15708, titles); flow-agents 6 ("one card per workflow naming the steps that call it"); microcopy 19.7 (agent map card); UX checklist 9.9 card names

The agents feature shall show, on each workflow card of the agent map, the workflow's steps that run the agent, named as their cards on the workflow's canvas name them (the title, else the id), in the workflow's order, as the card's detail line joined by commas, and shall name the card "Workflow" with the workflow's name, then "uses" with the agent's name "in" those steps, the last two joined by "and".

## Examples

- Given the workflow "Support reply" runs "Mail triage" in its step `draft`, then its card shows "draft" and is named "Workflow Support reply, uses Mail triage in draft".
- Given it runs "Mail triage" in `sort`, `check` and `reply`, in that order, then its card shows "sort, check, reply" and is named "Workflow Support reply, uses Mail triage in sort, check and reply".
- Given its step `sort` is titled "Sort the mail" and `reply` has no title, then its card shows "Sort the mail, reply" and is named "Workflow Support reply, uses Mail triage in Sort the mail and reply".
