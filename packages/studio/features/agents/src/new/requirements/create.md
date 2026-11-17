# agents.new.create

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 2); flow-agents 2.2; microcopy 8.2; kit T6-F17 to F20; UX 9.1, 2.1

When the user chooses **New agent**, the agents feature shall ask for a name, and for a hub when there is more than one, in a "New agent" dialog that shows the file the agent will be written to, create the agent through the host, close the dialog and open the agent in its tab, and, while the name is empty, not create anything and say "Give it a name." under the field.

## Examples

- Given one hub "acme", then the dialog has **Name**, focused, no Hub field and the line "Folder: hubs/acme/agents/".
- Given the hubs "acme" and "beta", then a **Hub** field lists both, and picking "beta" changes the line to "Folder: hubs/beta/agents/".
- Given the name "Refund checker", then the line reads "File: hubs/acme/agents/refund-checker.agent.yaml"; when acme already has `refund-checker`, it reads "refund-checker-2.agent.yaml".
- Given the user presses **Create** with the name "Refund checker", then the host creates it in the picked hub and its tab opens.
- Given the name is empty, then **Create** shows "Give it a name.", focuses Name and creates nothing.
- Given the host can't write the file because "the disk is full", then the dialog says "Couldn't create the agent: the disk is full." and **Create** tries again.
- Given the workspace has no default model, then the dialog says "It has no model yet. Pick one in Configuration › Model."; otherwise it shows no note.
- Given the window is a phone, then the dialog has no File line and says "It starts with the workspace's default model and runs in a sandbox on your computer.".
- Given the user wrote "Check refunds against the policy." in **What should it do? (optional)**, then **Create** hands it to the host as the agent's instructions; left empty, the agent starts with none.
- Given that box holds text that looks like a key, then **Create** says "This looks like a key. Keep it as a secret instead?" under it, focuses it and creates nothing.
