# workflows.new.first-hub

- Status: draft
- Since: unreleased
- Source: HAL-14119; board answer on HAL-12723 ("Can we not make a \"Default\" hub?"); builds on `workflows.new.create`, `workspace.default-hub`

When the workspace has no hub, the workflows feature shall still offer **New workflow** on a desktop once the workflows have loaded, on the list and through Ctrl K, and the "New workflow" dialog shall put the workflow in the Default hub (`hubs/default`), show its file there and hand the host that hub, so the host writes the hub with the workflow.

## Examples

- Given a workspace with no hub, then the Workflows list shows **New workflow**, and Ctrl K's **New workflow** opens the dialog.
- Given that dialog, then it has no Hub field; with the name "Daily summary" it reads "File: hubs/default/workflows/daily-summary.workflow.yaml".
- Given the user presses **Create** with the name "Daily summary", then the host is asked for "Daily summary" in the hub `default` and the workflow opens in its tab.
