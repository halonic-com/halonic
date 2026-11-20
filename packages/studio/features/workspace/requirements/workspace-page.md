# workspace.workspace-page

- Status: active
- Since: unreleased
- Source: flow-workspace 6, states-flow-map 2.7 (HAL-5878), microcopy 4.5; HAL-1291; HAL-10915 (B6 of the UX acceptance rows, HAL-12735)

The Workspace feature shall add the `workspace` item kind, whose page is titled "Workspace settings" and shows the open workspace's **Trust** section when the app gives it the folder's trust. It shall add the commands `workspace.open`, `workspace.open-trust`, `workspace.open-models` and `workspace.open-budget`, which open the page in the active tab, or the tab that shows it already. `workspace.open-trust`, `workspace.open-models` and `workspace.open-budget` shall scroll to their section and put focus on its first heading, also when the section is drawn after the command ran. `workspace.open-budget` shall then fill the Budget block with the accent-soft colour for 1 second, with no movement, and open no editor; a new request or the page closing ends the fill. The workspace menu's **Workspace settings…** shall run `workspace.open`. The page shall place the sections other features add to the `workspace` kind (`shell.item-page-sections`) after Trust, so Models comes with the feature that owns it.

## Examples

- Given a folder open in the desktop app,
  when the person chooses **Workspace settings…** in the workspace menu,
  then the page "Workspace settings" opens with the **Trust** section.
- Given the served Studio, which has no folder to trust,
  then the page shows its title and no **Trust** section.
- Given a workspace with a monthly budget,
  when the person chooses **Change budget** on the Inbox's monthly budget notice,
  then Workspace settings opens in the Inbox's tab with focus on the **Budget** heading, the Budget
  block is filled with accent-soft for 1 second, and its editor stays closed.
- Given the same,
  when the person runs `workspace.open-models`,
  then focus is on the **Models** heading, not on **Budget** inside it, and nothing is filled.
