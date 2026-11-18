# agents.page.frame

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 3); flow-agents 3.1 and 8; microcopy 8.4; state R9

The agents feature shall open an agent in its tab as a page with the letter avatar, "AGENT" and the agent's name, and under it the agent's Runs; while the agent is being read it shall show a skeleton after 300 ms with the screen-reader label "Loading <name>", when it can't be read it shall say why with **Try again**, and when the agent is gone it shall show the item-gone state with a way to the Agents list.

## Examples

- Given the agent "Sorter", then the page shows "AGENT", "Sorter" and "Runs aren't listed by agent yet. See them on the Runs page.".
- Given the read takes over 300 ms, then screen readers hear "Loading sorter"; after 10 s the page adds "Still loading" and **Try again**.
- Given the read failed, then the page shows "Couldn't load this agent", the reason and **Try again**; when the read then works, the name takes the focus.
- Given the agent isn't in the workspace, then the page says the agent is gone and offers the Agents list.
- Given the agent is renamed in its file, then the page shows the new name without a skeleton.
