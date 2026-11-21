# agents.configuration.agent-steps

- Status: draft
- Since: unreleased
- Source: HAL-13179 (T6); flow-agents 5.2 and 7; microcopy 8.5 (Agent steps page, none yet); T6 checklist part 2 (2.3)

The agents feature shall give the agent's Configuration an Agent steps page, after Subagents, that lists the agent's agent steps (`methods` in its file) in the file's order, each with its name and its description in one line (nothing when it has none), where a name opens the agent step as a card on top of the panel, and offers **New agent step**. With no agent steps the page shall be the titled Empty state "No agent steps yet" · "An agent step is a named piece of work inside this agent, with its own instructions, model and model call limit." · **New agent step**. **New agent step** shall open a dialog with **Name** and **What should it do?** (hint "This becomes its instructions."); **Create** shall stay pressable and, with either empty, say "Give it a name." or "Say what it should do." under it and add nothing; otherwise it shall add the agent step, close the dialog and open its card. A failed add shall say "Couldn't create the agent step: *reason*." in the dialog. The agent step's card shall show its description, its **Instructions**, its model ("*smart*, the agent's model" when it has none of its own, "The agent's model" when the agent names none either) and its model call limit ("*6*, the agent's limit" when it has none of its own), and drop when the agent step is gone. The card only shows the agent step: it doesn't edit it yet, and it doesn't show the agent step's output or tools yet (flow-agents 7 has both; follow-up HAL-14708).

## Examples

- Given Writer has no agent steps, then the page shows "No agent steps yet" with its sentence and **New agent step**.
- Given Writer has `draft-reply` with the description "Drafts a reply to the customer." and `check` with none, then the page lists "draft-reply" with that line, then "check" alone.
- Given Writer has those two agent steps, when the person presses draft-reply, then a card "Acme Mail › Writer › draft-reply" shows its instructions and its model smart; for `check`, "fast, the agent's model" and "8, the agent's limit".
- Given the New agent step dialog is open, when the person presses Create with both fields empty, then "Give it a name." and "Say what it should do." show; with "Draft reply" and "Keep it short." the agent step `draft-reply` is added and its card opens.
- Given the agent step's card is open, when the agent step is gone from the file, then its card drops.
