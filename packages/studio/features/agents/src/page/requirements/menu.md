# agents.page.menu

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A4, from the UX check HAL-12213); HAL-1299 point 3; flow-agents 3.1; checklist 9.2

The agents feature shall give the agent's page a ⋮ button named "More actions for *name*" in its header, whose menu holds **Open as file** (on the desktop, when the app can open a file) and **Delete**; Delete shall move the agent to the trash at once with no dialog and replace the page with a strip that says "This agent was moved to the trash." (with a second line when workflows run the agent in a step) and has **Undo** with the focus; Undo, or the workspace's own undo, shall bring the page back with its name focused, and Undo shall say why, by the agent's name, when it can't; a failed move shall say why in a toast that stays, with **Try again**.

## Examples

- Given the agent "Sorter" is open, then the header has "More actions for Sorter" with Open as file and Delete.
- Given the window is a phone, then the menu has Delete only.
- Given Delete is chosen, then the page shows "This agent was moved to the trash." and **Undo**, which has the focus, and no toast.
- Given a workflow runs Sorter in a step, then the strip adds "1 workflow now shows an error until you pick another agent for its step.".
- Given **Undo** is pressed, then the page is back and its name has the focus.
- Given the agent comes back by the workspace's undo instead, then the page is back without the strip.
- Given Undo can't put Sorter back, then a toast says "Couldn't put Sorter back" with the reason.
- Given **Open as file** is chosen, then the app opens `hubs/acme/agents/sorter.agent.yaml` in a tab.
