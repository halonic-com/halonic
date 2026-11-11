# @halonicjs/studio-feature-workspace

The Workspace feature of the Studio: the desktop app's window and the workspaces open in it.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-workspace` (the feature) and `@halonicjs/studio-feature-workspace/api`

## Example

```ts
import {
  mountWorkspaceWindow,
  RecentWorkspaces,
  WorkspaceSwitcher,
} from "@halonicjs/studio-feature-workspace";

const switcher = new WorkspaceSwitcher({
  pickFolder,
  openFolder,
  recent: new RecentWorkspaces(window.localStorage),
  toasts: shell.toasts,
});
const mounted = mountWorkspaceWindow(root, { shell, switcher, platform, language: "en" });
await switcher.pickAndOpen(); // the picked folder is shown, with the toast "Opened Acme"
// when the page goes:
mounted.unmount();
```

`WorkspaceWindow` shows the Welcome screen while no workspace is open, else the shown workspace's Studio window with the workspace switcher at the top of its sidebar; `mountWorkspaceWindow` draws it into the page. `WorkspaceSwitcher` opens, shows and closes the window's workspaces. Opening a folder that is already open shows it, and a folder that fails to open adds no slot (requirement `workspace.failed-open-leaves-no-slot`). `RecentWorkspaces` remembers the last 9 workspaces shown (`RECENT_WORKSPACES`) in the page's storage. Ctrl 1 to Ctrl 9 (⌘ on macOS) show the open workspace at that position (`workspaceKeyPosition`). The `/api` entry offers nothing to other features yet.
