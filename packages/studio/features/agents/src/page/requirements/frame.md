# agents.page.frame

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 3); HAL-13180; flow-agents 3.1 and 8; microcopy 8.4; state R9; HAL-12399; HAL-12642; HAL-12934

The agents feature shall open an agent in its tab as a page with the letter avatar, "AGENT" and the agent's name, and under it the agent's Configuration, with its Flow and its Runs in the other tabs, where an agent no workflow runs says runs aren't listed by agent yet, with **Open the Runs page ›** to the Runs page where the app can open it, and that it runs as a step in a workflow, and an agent that workflows run never says it has no runs but names the workflow, or how many, whose runs are in Runs; while the agent is being read it shall show a skeleton after 300 ms with the screen-reader label "Loading <name>", when it can't be read it shall say why with **Try again**, and when the agent is gone it shall show the item-gone state with a way to the Agents list.

## Examples

- Given the agent "Sorter", then the page shows "AGENT" and "Sorter", its tabs Flow, Runs and Configuration, and opens on Configuration.
- Given no workflow runs the agent "Sorter", then its Runs tab says "Runs aren't listed by agent yet. **Open the Runs page ›**" and "Sorter runs as a step in a workflow. Add it to one in Workflows."; pressing **Open the Runs page ›** opens the Runs page.
- Given an app that can't open pages, then that line says "Runs aren't listed by agent yet." alone.
- Given the workflow "Support reply" runs "Sorter", then its Runs tab says "Sorter runs as a step in Support reply. That workflow's runs are in Runs." and not that it has no runs; given two workflows run it, it says "Sorter runs as a step in 2 workflows. Their runs are in Runs.".
- Given the workflows can't be read, then the Runs tab says only "Sorter runs as a step in a workflow.".
- Given the read takes over 300 ms, then screen readers hear "Loading sorter"; after 10 s the page adds "Still loading" and **Try again**.
- Given the read failed, then the page shows "Couldn't load this agent", the reason and **Try again**; when the read then works, the name takes the focus.
- Given the agent isn't in the workspace, then the page says the agent is gone and offers the Agents list.
- Given the agent is renamed in its file, then the page shows the new name without a skeleton.
