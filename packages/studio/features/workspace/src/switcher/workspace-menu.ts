import type { MenuEntry, MenuItem } from "@halonicjs/studio-kit";
import { hintKeys, type KeyboardPlatform } from "@halonicjs/studio-shell";
import type { RememberedWorkspace } from "./recent-workspaces.ts";

/** What {@link workspaceMenu} lists and what its rows do. */
export interface WorkspaceMenuOptions {
  /** The workspaces remembered on this device, most recent first. */
  readonly recent: readonly RememberedWorkspace[];
  /** The open workspaces' locations, in the order they were opened. */
  readonly open: readonly string[];
  /** The shown workspace's location, or `undefined` on the "No workspace" slot. */
  readonly shown: string | undefined;
  readonly platform: KeyboardPlatform;
  /** Shows the workspace in that folder, opening it first when it isn't open. */
  readonly onOpen: (location: string) => void;
  /** Asks the folder picker for a folder and opens it. */
  readonly onOpenFolder: () => void;
  /** Closes the shown workspace. */
  readonly onClose: () => void;
}

/**
 * The workspace menu's rows (flow-workspace 2.1a, microcopy 4.1 and 4.2): the heading **Recent**
 * and the remembered workspaces, each its name over its folder with the shown one checked, a
 * divider, **Open a folder…**, a divider and **Close workspace**. With nothing remembered the
 * heading and its divider go too. An open workspace shows its Ctrl 1 to Ctrl 9 key
 * (`workspace.switcher.ctrl-number-keys`).
 *
 * New workspace… and Workspace settings… join the menu with the dialog and the page that they
 * open, so the menu never has a row that does nothing.
 *
 * @example
 * <WorkspaceSwitcher workspace={{ name: "Acme", folder: "/work/acme" }} menu={workspaceMenu(options)} />
 */
export function workspaceMenu(options: WorkspaceMenuOptions): readonly MenuEntry[] {
  const rows = options.recent.map((workspace) => recentRow(workspace, options));
  const recent: readonly MenuEntry[] =
    rows.length === 0 ? [] : [{ heading: "Recent" }, ...rows, "divider"];
  const close: readonly MenuEntry[] =
    options.shown === undefined
      ? []
      : ["divider", { id: "close-workspace", label: "Close workspace", onSelect: options.onClose }];
  return [
    ...recent,
    { id: "open-folder", label: "Open a folder…", onSelect: options.onOpenFolder },
    ...close,
  ];
}

function recentRow(workspace: RememberedWorkspace, options: WorkspaceMenuOptions): MenuItem {
  const position = options.open.indexOf(workspace.location) + 1;
  const keys =
    position >= 1 && position <= 9 ? { keys: hintKeys(`Mod+${position}`, options.platform) } : {};
  return {
    id: `recent:${workspace.location}`,
    label: workspace.name,
    detail: workspace.location,
    checked: workspace.location === options.shown,
    ...keys,
    onSelect: () => options.onOpen(workspace.location),
  };
}
