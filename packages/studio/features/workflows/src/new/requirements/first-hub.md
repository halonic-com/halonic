# workflows.new.first-hub

- Status: draft
- Since: unreleased
- Source: HAL-14119; board answer on HAL-12723 ("Can we not make a \"Default\" hub?"); builds on `workflows.new.create`, `workspace.default-hub`; UX check C503 (M1, HAL-14914) for a hub file that doesn't load

When the workspace has no hub, the workflows feature shall still offer **New workflow** on a desktop once the workflows have loaded, on the list and through Ctrl K, and the "New workflow" dialog shall put the workflow in the Default hub (`hubs/default`), show its file there and hand the host that hub, so the host writes the hub with the workflow. When the host refuses because the Default hub's file doesn't load (`studio.first-hub-unloadable`), the dialog shall stay open and say "Couldn't create the workflow: hubs/default/hub.yaml can't be read right now (line *3*). Fix it in the file, then try again.", never the parser's own sentence.

## Examples

- Given a workspace with no hub, then the Workflows list shows **New workflow**, and Ctrl K's **New workflow** opens the dialog.
- Given that dialog, then it has no Hub field; with the name "Daily summary" it reads "File: hubs/default/workflows/daily-summary.workflow.yaml".
- Given the user presses **Create** with the name "Daily summary", then the host is asked for "Daily summary" in the hub `default` and the workflow opens in its tab.
- Given `hubs/default/hub.yaml` doesn't load at line 3, when the user presses **Create**, then the dialog says "Couldn't create the workflow: hubs/default/hub.yaml can't be read right now (line 3). Fix it in the file, then try again." and nothing opens.
