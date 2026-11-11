// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, type Shell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MountedWorkspaceWindow, mountWorkspaceWindow } from "./mount-workspace-window.tsx";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import { folderName, MENU_BUSY_AFTER_MS, WorkspaceSwitcher } from "./workspace-switcher.ts";
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

/** Starts the window; a folder in `gone` fails to open as not found. */
function start(
  picks: string[],
  gone: string[] = [],
): { shell: Shell; switcher: WorkspaceSwitcher } {
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
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

  it("lists Recent on Welcome, and a row opens its workspace", async () => {
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));
    await act(() => switcher.closeShown());

    const row = element.querySelector<HTMLButtonElement>('button[aria-label="acme, /work/acme"]');
    expect(element.querySelector("h2")?.textContent).toBe("Recent");
    await act(async () => row?.click());
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
  });

  it("forgets a Recent row whose folder is gone from Welcome's Remove from Recent", async () => {
    const { switcher } = start([], ["/work/old"]);
    act(() => switcher.recent.remember({ location: "/work/old", name: "old" }));

    const row = element.querySelector<HTMLButtonElement>('button[aria-label="old, /work/old"]');
    await act(async () => row?.click());
    const remove = [...element.querySelectorAll("button")].find(
      (each) => each.textContent === "Remove from Recent",
    );
    await act(async () => remove?.click());
    expect(switcher.recent.list()).toEqual([]);
    expect(element.querySelector("h2")).toBeNull();
  });

  it("shows the switcher busy while the switcher says so (workspace.busy-switcher)", async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));
    const slow = new Promise<undefined>((resolve) => {
      finish = () => resolve(undefined);
    });

    let opening: Promise<void> = Promise.resolve();
    act(() => {
      opening = switcher.fromMenu(() => slow);
    });
    act(() => vi.advanceTimersByTime(MENU_BUSY_AFTER_MS));
    expect(switcherButton()?.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      finish();
      await opening;
    });
    expect(switcherButton()?.hasAttribute("aria-busy")).toBe(false);
    vi.useRealTimers();
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
