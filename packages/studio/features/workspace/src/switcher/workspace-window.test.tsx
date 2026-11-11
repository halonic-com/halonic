// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, type Shell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MountedWorkspaceWindow, mountWorkspaceWindow } from "./mount-workspace-window.tsx";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import { folderName, WorkspaceSwitcher } from "./workspace-switcher.ts";
import { workspaceKeyPosition } from "./workspace-window.tsx";

// Tells React this is a test, so it checks that updates happen inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let mounted: MountedWorkspaceWindow | undefined;
let restoreMedia: () => void = () => {};

beforeEach(() => {
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
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
  restoreMedia();
});

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

function start(picks: string[]): { shell: Shell; switcher: WorkspaceSwitcher } {
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
  const storage = new Map<string, string>();
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => picks.shift(),
    openFolder: async (location) => {
      const name = folderName(location);
      const workspace = new StudioWorkspace({
        toasts: createToastStore(),
        services: noServices(),
        name,
      });
      return { name, workspace, dispose: async () => {} };
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
    });
  });
  return { shell, switcher };
}

function switcherButton(): HTMLButtonElement | null {
  return element.querySelector<HTMLButtonElement>('button[aria-label^="Workspace: "]');
}

async function press(init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
  });
}

verifies("workspace.workspace-window", () => {
  it("shows Welcome with no switcher until a folder is open", () => {
    start([]);

    expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio");
    expect(switcherButton()).toBeNull();
  });

  it("shows the opened workspace with its switcher, named after the folder", async () => {
    const { switcher } = start([]);

    await act(() => switcher.openLocation("/work/acme"));
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    expect(switcherButton()?.textContent).toContain("/work/acme");
    expect(element.textContent).not.toContain("Halonic Studio");
  });

  it("opens the picked folder from Welcome's Open folder", async () => {
    const { shell } = start(["/work/acme"]);
    const open = element.querySelector("button");

    await act(async () => open?.click());
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    expect(shell.toasts.list().map((toast) => toast.title)).toEqual(["Opened acme"]);
  });

  it("shows the workspace at a position on Ctrl and its number", async () => {
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));
    await act(() => switcher.openLocation("/work/beta"));

    await press({ key: "1", ctrlKey: true });
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    await press({ key: "2", ctrlKey: true, altKey: true });
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
  });

  it("goes back to Welcome when the last workspace closes", async () => {
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));

    await act(() => switcher.closeShown());
    expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio");
  });
});

describe("workspaceKeyPosition (workspace.switcher.ctrl-number-keys)", () => {
  const key = (init: Partial<KeyboardEvent>) => ({
    key: "1",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  });

  it("reads Ctrl 1 to Ctrl 9, or ⌘ on macOS", () => {
    expect(workspaceKeyPosition(key({ ctrlKey: true }), "windows")).toBe(1);
    expect(workspaceKeyPosition(key({ key: "9", ctrlKey: true }), "linux")).toBe(9);
    expect(workspaceKeyPosition(key({ metaKey: true }), "macos")).toBe(1);
  });

  it("leaves Alt, Shift, Ctrl 0 and the other platform's key alone", () => {
    expect(workspaceKeyPosition(key({ ctrlKey: true, altKey: true }), "windows")).toBeUndefined();
    expect(workspaceKeyPosition(key({ ctrlKey: true, shiftKey: true }), "windows")).toBeUndefined();
    expect(workspaceKeyPosition(key({ key: "0", ctrlKey: true }), "windows")).toBeUndefined();
    expect(workspaceKeyPosition(key({ ctrlKey: true }), "macos")).toBeUndefined();
    expect(workspaceKeyPosition(key({ metaKey: true }), "windows")).toBeUndefined();
  });
});
