# agents.list.row-menu

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A4, from the UX check HAL-12213); HAL-12234 (the UX check of A4); HAL-1299 point 3; flow-agents 2.1; microcopy 8.1; checklist 9.1, 9.2 and 9.12

The agents feature shall give each row of the Agents list a ⋮ button named "More actions for *name*" whose menu holds **Open**, **Open in new tab**, **Open as file** (when the app can open a file) and **Delete**, with Delete last, and on a phone, where tapping the row opens the agent and there are no tabs, **Delete** alone; Delete shall delete the agent at once with no dialog, give the focus to the next row, else the previous one, else the empty state, and say so with a toast that has **Undo** and, when workflow steps run the agent, a second line counting the steps that now show an error; the toast shall close when the agent comes back some other way, such as the workspace's undo; when the agent can't be deleted, a toast that stays shall say why with **Try again**; Undo shall bring the row back and give it the focus, and say why when it can't.

## Examples

- Given the agent "Sorter", then "More actions for Sorter" opens Open, Open in new tab, Open as file and Delete.
- Given the window is a phone, then the menu has only Delete.
- Given Delete is chosen, then the agent is deleted with no dialog and a toast says "Deleted Sorter" with Undo.
- Given Sorter and Writer, and Sorter is deleted, then Writer's row has the focus.
- Given a workflow runs Sorter in one step, then the toast's second line says "1 workflow step now shows an error until you pick another agent.".
- Given one workflow runs Writer in two steps, then the line says "2 workflow steps now show an error until you pick another agent.".
- Given the workspace's undo brings Sorter back, then the toast with Undo closes.
- Given Undo is pressed, then the row is back and has the focus.
- Given the agent can't be deleted because "the disk is full", then a toast that stays says "Couldn't delete Sorter: the disk is full." with **Try again**.
- Given **Open as file** is chosen, then the app opens the file of the agent (`hubs/acme/agents/sorter.agent.yaml`) in a tab.
