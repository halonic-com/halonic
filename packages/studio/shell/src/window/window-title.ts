import { useEffect, useSyncExternalStore } from "react";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";

/** The app's name, last in every window title. */
export const appName = "Halonic";

/** The parts between the page, the workspace and the app in a window title. */
const separator = " · ";

/**
 * The window's title (`shell.window-title`): the page the user is on, the workspace's name and
 * the app's name, such as "Home · Acme · Halonic". The workspace's name is left out until the
 * window knows it (T3 opens workspaces by name), and an empty or blank name counts as none.
 *
 * @example
 * windowTitle("Support reply", "Acme"); // "Support reply · Acme · Halonic"
 * windowTitle("Home"); // "Home · Halonic"
 * windowTitle("Home", ""); // "Home · Halonic"
 */
export function windowTitle(page: string, workspace?: string): string {
  const knowsWorkspace = workspace !== undefined && workspace.trim() !== "";
  const parts = knowsWorkspace ? [page, workspace, appName] : [page, appName];
  return parts.join(separator);
}

/**
 * The active tab's title, following tab switches, Back and Forward, and renames.
 */
export function useActiveTabTitle(tabs: TabSet): string {
  return useSyncExternalStore(
    (onChange) => tabs.subscribe(onChange),
    () => currentLocation(tabs.active).title,
  );
}

/**
 * Keeps `document.title` as the {@link windowTitle} of the page shown: the active tab's on the
 * desktop, the phone page's on a phone (`shell.window-title`). The browser's tab reads it. In the
 * desktop app the Tauri shell copies it into the native window title, which the task bar and
 * window switchers read (`studio.src-tauri.window-title`).
 */
export function useWindowTitle(page: string, workspace?: string): void {
  useEffect(() => {
    document.title = windowTitle(page, workspace);
  }, [page, workspace]);
}
