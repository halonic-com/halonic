import { KindedError } from "@halonicjs/std";
import { createToastStore } from "@halonicjs/studio-kit";
import {
  createShell,
  type Feature,
  type ResourceWatch,
  type Shell,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { act } from "react";
import type { NewWorkspaceHost } from "../new-workspace/new-workspace-dialog.tsx";
import { type MountedWorkspaceWindow, mountWorkspaceWindow } from "./mount-workspace-window.tsx";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import type { WorkspaceSaving } from "./workspace-saving.ts";
import { folderName, WorkspaceSwitcher } from "./workspace-switcher.ts";

// Tells React this is a test, so it checks that updates happen inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The element the window mounts in; it is in the page only during a test. */
export const element = document.createElement("div");
let mounted: MountedWorkspaceWindow | undefined;
let restoreMedia: () => void = () => {};

/** Puts `element` in the page; run it before each test. */
export function setUpWindow(): void {
  // jsdom has no matchMedia: every query fails, so the window is a desktop one.
  const original = window.matchMedia;
  window.matchMedia = (query) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  restoreMedia = () => {
    window.matchMedia = original;
  };
  document.body.append(element);
}

/** Unmounts the window and takes `element` out of the page; run it after each test. */
export function tearDownWindow(): void {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
  restoreMedia();
}

/** A workspace's services for a shell with no features: nothing is ever provided or read. */
function noServices() {
  return {
    provide: () => {
      throw new Error("No feature provides services here.");
    },
    get: () => {
      throw new Error("No feature reads services here.");
    },
    has: () => false,
  };
}

/** Starts the window; a folder in `gone` fails to open as not found. */
export function start(
  picks: string[],
  gone: string[] = [],
  saving?: WorkspaceSaving,
  features: readonly Feature[] = [],
  newWorkspace?: NewWorkspaceHost,
  resources?: ResourceWatch,
): { shell: Shell; switcher: WorkspaceSwitcher } {
  const shell = createShell({ features, host: "desktop-app", platform: "windows" });
  const storage = new Map<string, string>();
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => picks.shift(),
    openFolder: async (location) => {
      if (gone.includes(location)) {
        throw new KindedError("not_found", `No folder ${location}`);
      }
      const name = folderName(location);
      const workspace = new StudioWorkspace({
        toasts: createToastStore(),
        services: noServices(),
        name,
      });
      return { name, workspace, saving, dispose: async () => {} };
    },
    recent: new RecentWorkspaces({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    }),
    toasts: shell.toasts,
  });
  act(() => {
    mounted = mountWorkspaceWindow(element, {
      shell,
      switcher,
      platform: "windows",
      language: "en",
      ...(newWorkspace === undefined ? {} : { newWorkspace }),
      resources,
    });
  });
  return { shell, switcher };
}

export function switcherButton(): HTMLButtonElement | null {
  return element.querySelector<HTMLButtonElement>('button[aria-label^="Workspace: "]');
}

/** The workspace menu's row that reads `label`. */
export function menuRow(label: string): HTMLElement | undefined {
  return [...element.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (each) => each.textContent === label,
  );
}

/** The `h1` of the page the shown workspace shows. */
export function shownHeading(): HTMLElement | null {
  return element.querySelector<HTMLElement>("main h1");
}

export async function press(init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
  });
}
