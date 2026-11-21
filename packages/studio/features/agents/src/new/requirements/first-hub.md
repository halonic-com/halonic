# agents.new.first-hub

- Status: draft
- Since: unreleased
- Source: HAL-14119; board answer on HAL-12723 ("Can we not make a \"Default\" hub?"); builds on `agents.new.create`, `workspace.default-hub`; UX check C503 (M1, HAL-14914) for a hub file that doesn't load

When the workspace has no hub, the agents feature shall still offer **New agent** once the agents have loaded, on the list and through Ctrl K, and the "New agent" dialog shall put the agent in the Default hub (`hubs/default`), show its file there and hand the host that hub, so the host writes the hub with the agent. When the host refuses because the Default hub's file doesn't load (`studio.first-hub-unloadable`), the dialog shall stay open and say "Couldn't create the agent: hubs/default/hub.yaml can't be read right now (line *3*). Fix it in the file, then try again.", never the parser's own sentence. On a phone, which has no room for the path, it shall say "Couldn't create the agent: the Default hub's file can't be read right now. Fix it on a computer, then try again."

## Examples

- Given a workspace with no hub, then the Agents list shows **New agent**, and Ctrl K's **New agent** opens the dialog.
- Given that dialog, then it has no Hub field and the line "Folder: hubs/default/agents/"; with the name "Greeter" it reads "File: hubs/default/agents/greeter.agent.yaml".
- Given the user presses **Create** with the name "Greeter", then the host is asked for "Greeter" in the hub `default` and the agent opens in its tab.
- Given `hubs/default/hub.yaml` doesn't load at line 3, when the user presses **Create**, then the dialog says "Couldn't create the agent: hubs/default/hub.yaml can't be read right now (line 3). Fix it in the file, then try again." and nothing opens.
