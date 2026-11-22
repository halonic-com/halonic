# agents.page.menu

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A4, from the UX check HAL-12213); HAL-12234 (the UX check of A4); HAL-12278; HAL-1299 point 3; HAL-15374 (C565 6: the strip names the agent, and leaving the page keeps Undo); flow-agents 3.1; microcopy 8.1; checklist 9.2

The agents feature shall give the agent's page a ⋮ button named "More actions for *name*" in its header, or in the phone's top bar after the name where the page is under one (UX 9.13), whose menu holds **Open as file** (on the desktop, when the app can open a file) and **Delete**; Delete shall delete the agent at once with no dialog and replace the page with the kit's trash strip, 16px under the top, that says "*name* was deleted." (with a second line counting the workflow steps that run the agent) and has **Undo** with the focus; Undo, or the workspace's own undo, shall bring the page back with its name focused, and Undo shall say why, by the agent's name, when it can't, in a toast that stays, with **Undo** to try again; when the page goes while the agent is still deleted, a toast that stays shall take over the strip, worded as the Agents list's ("Deleted *name*", with the same second line) and with **Undo**, and it shall close when the agent comes back some other way; a failed delete shall say why in a toast that stays, with **Try again**.

## Examples

- Given the agent "Sorter" is open, then the header has "More actions for Sorter" with Open as file and Delete.
- Given the window is a phone, then the menu has Delete only.
- Given the page is under the phone's top bar, then the top bar shows Back, "Sorter" and the ⋮, and the header has no ⋮; after Delete the ⋮ is gone.
- Given Delete is chosen, then the page shows "Sorter was deleted" and **Undo**, which has the focus, and no toast.
- Given Sorter was deleted from its page and the page goes, then a toast that stays says "Deleted Sorter" with **Undo**, which puts Sorter back.
- Given that toast, when the workspace's undo puts Sorter back, then the toast closes.
- Given a workflow runs Sorter in one step, then the strip adds "1 workflow step now shows an error until you pick another agent.".
- Given **Undo** is pressed, then the page is back and its name has the focus.
- Given the agent comes back by the workspace's undo instead, then the page is back without the strip.
- Given Undo can't put Sorter back, then a toast that stays says "Couldn't put Sorter back" with the reason and **Undo**, to try again.
- Given **Open as file** is chosen, then the app opens `hubs/acme/agents/sorter.agent.yaml` in a tab.
