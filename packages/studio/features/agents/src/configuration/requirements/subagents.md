# agents.configuration.subagents

- Status: draft
- Since: unreleased
- Source: HAL-13179 (T6); flow-agents 5.4; microcopy 8.5; T6 checklist part 2 (2.1 UX 9.8, 2.7, 2.9); K8 kept parts (`agents.editor.add-subagent-dialog`, `.subagent-loop-check`)

The agents feature shall give the agent's Configuration a Subagents page that says "The agents *Mail triage* hands work to.", shows each agent its file names as subagents as a chip with its name and a ✕ named "Remove *Writer*" that removes it, shows each other agent of the hub that would close a loop as a disabled chip without ✕ with its reason as visible text next to it ("Sorter already hands work to Mail triage"), and offers **Add subagent**. Removing a chip shall move focus to the next chip's ✕, else to **Add subagent**. **Add subagent** shall open the dialog "Add a subagent to *Mail triage*" with **Pick an agent**, the agents that wouldn't loop, sorted by name, as the rows of a List named "Pick an agent", each with its whole description under its name and nothing when it has none, where a click adds it and closes the dialog; then **Or create a new agent** (**New agent** when there is nothing to pick) with a box whose placeholder is "Name" and whose accessible name is "New agent's name", and **Create**, which stays pressable and, with the box empty, says "Give it a name." and creates nothing, and otherwise creates the agent in the same hub, adds it and closes; a failed create shall say "Couldn't create the agent: *reason*." in the dialog. Each change shall save the whole list at once. A change the host refuses as a loop shall show its reason as a toast ("Sorter already hands work to Mail triage; that would be a loop.") and leave the chips as they were; another failure shall show "Couldn't save *Mail triage*'s subagents" with the reason. When the hub's agents can't be read, the page shall say "Couldn't load the hub's agents" with the reason and **Try again**.

## Examples

- Given Mail triage hands work to Writer, then the page shows "The agents Mail triage hands work to." and a chip "Writer" with ✕ "Remove Writer"; pressing it saves no subagents.
- Given Sorter hands work to Mail triage, then Sorter shows as a disabled chip with "Sorter already hands work to Mail triage", and the dialog doesn't offer it.
- Given Refund checker with the description "Checks refunds." and Archive with none, then the dialog lists "Archive" then "Refund checker" with "Checks refunds." under it; clicking Archive saves Archive as a subagent and closes the dialog.
- Given every other agent is a subagent already, then the dialog's create heading is "New agent".
- Given the dialog is open, when the person presses Create with the box empty, then "Give it a name." shows and no agent is made; with "Sorter 2" it makes the agent `sorter-2` in the hub, adds it and closes.
- Given the host refuses the change as a loop, then the toast says the host's sentence and the chips stay as they were.
