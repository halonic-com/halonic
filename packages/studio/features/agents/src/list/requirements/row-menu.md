# agents.list.row-menu

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A4, from the UX check HAL-12213); HAL-1299 point 3; flow-agents 2.1; checklist 9.1

The agents feature shall give each row of the Agents list a ⋮ button named "More actions for *name*" whose menu holds **Open**, **Open in new tab**, **Open as file** (on the desktop, when the app can open a file) and **Delete**, with Delete last; Delete shall move the agent to the trash at once with no dialog and say so with a toast that has **Undo**, and, when workflows run the agent in a step, a second line saying they show an error until they name another agent, and when the agent can't be moved, a toast that stays shall say why with **Try again**; Undo shall bring the row back and give it the focus, and say why when it can't.

## Examples

- Given the agent "Sorter", then "More actions for Sorter" opens Open, Open in new tab, Open as file and Delete.
- Given the window is a phone, then the menu has no Open as file.
- Given Delete is chosen, then the agent is in the trash with no dialog and a toast says "Moved Sorter to the trash" with Undo.
- Given a workflow runs Sorter in a step, then the toast's second line says "1 workflow now shows an error until you pick another agent for its step.".
- Given Undo is pressed, then the row is back and has the focus.
- Given the agent can't be moved because "the disk is full", then a toast that stays says "Couldn't move Sorter to the trash: the disk is full." with **Try again**.
- Given **Open as file** is chosen, then the app opens the file of the agent (`hubs/acme/agents/sorter.agent.yaml`) in a tab.
