# agents.list.rows-and-states

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 2); flow-agents 2.1; microcopy 8.1; UX 9.1

The Agents place shall list the workspace's agents under "Agents" in one section per hub, each row with the agent's letter avatar, its name, its description under the name and its model, open an agent in its tab when a row is chosen, show the loading, empty, no-match and can't-load states in the approved words, and read the host again when it says the agents changed.

## Examples

- Given hubs "acme" and "beta" and the agents "Sorter" and "Refund checker" in acme, then acme lists "Refund checker" and "Sorter", and beta says "No agents in beta yet.".
- Given an agent with the description "Sorts the inbox." and the model "smart", then its row shows both.
- Given the user chooses the row "Sorter" in acme, then its tab opens; with Ctrl-click, middle click or Ctrl Enter it opens in a new tab.
- Given no agent in any hub, then the page shows "No agents yet", the sentence "An agent is an AI worker you describe in a file: its instructions, model, skills, knowledge and tools." and **New agent**, and no search field and no other New agent button.
- Given the agents are being read, then screen readers hear "Loading agents".
- Given the first read failed, then the page shows "Couldn't load agents", "The engine isn't answering. It may still be starting." and **Try again**.
- Given a read fails after the list was shown, then the rows stay and a line "The engine isn't answering. Showing what it said last." with **Try again** shows above them.
- Given the window is a phone, then the heading and sentence are there for screen readers only, because the top bar names the page.
- Given the user runs **New agent** from Ctrl K, then the Agents page opens with the New agent dialog.
- Given the user searches Ctrl K for an agent's name, id or description, then it is offered as "Agent · hub name".
- Given an agent was created or read, then its tab shows its name, not its id.
- Given the host says the agents changed, then the list reads them again and shows the new rows.
