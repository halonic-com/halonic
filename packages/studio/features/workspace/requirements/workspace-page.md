# workspace.workspace-page

- Status: active
- Since: 0.1.0
- Source: flow-workspace 6, states-flow-map 2.7 (HAL-5878), microcopy 4.5; HAL-1291

The Workspace feature shall add the `workspace` item kind, whose page is titled "Workspace settings" and shows the open workspace's **Trust** section when the app gives it the folder's trust. It shall add the commands `workspace.open` and `workspace.open-trust`, which open the page in the active tab, or the tab that shows it already. The workspace menu's **Workspace settings…** shall run `workspace.open`. The page's other sections come with the features that own them.

## Examples

- Given a folder open in the desktop app,
  when the person chooses **Workspace settings…** in the workspace menu,
  then the page "Workspace settings" opens with the **Trust** section.
- Given the served Studio, which has no folder to trust,
  then the page shows its title and no **Trust** section.
