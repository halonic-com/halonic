// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type MountedWorkspaceWindow,
  mountWorkspaceWindow,
} from "../switcher/mount-workspace-window.tsx";
import { RecentWorkspaces } from "../switcher/recent-workspaces.ts";
import { folderName, WorkspaceSwitcher } from "../switcher/workspace-switcher.ts";
import { FreshCopyAsks } from "./fresh-copy-asks.ts";
import type { CreatedSample } from "./sample-host.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let mounted: MountedWorkspaceWindow | undefined;

beforeEach(() => {
  window.matchMedia = (query) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
});

const copy: CreatedSample = {
  kind: "created",
  folder: "/docs/Acme sample 2",
  name: "Acme sample 2",
  trust: { kind: "trusted" },
};

const cant: CreatedSample = { kind: "cant", folder: "/docs/Acme sample 2", reason: "disk full" };

/**
 * The window, with Open demo when `withDemo`, and the asks the rest of the app calls. The sample
 * host answers `answers` in turn, then the copy; `events` records each folder opened.
 */
function start(withDemo: boolean, answers: CreatedSample[] = []) {
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
  const storage = new Map<string, string>();
  const events: string[] = [];
  const create = vi.fn(async (_known: readonly string[]) => answers.shift() ?? copy);
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => undefined,
    openFolder: async (location) => {
      events.push(`opened ${location}`);
      const name = folderName(location);
      const services = { provide: () => {}, get: () => undefined, has: () => false };
      const workspace = new StudioWorkspace({
        toasts: createToastStore(),
        services: services as never,
        name,
      });
      return { name, workspace, saving: undefined, dispose: async () => {} };
    },
    recent: new RecentWorkspaces({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    }),
    toasts: shell.toasts,
  });
  const asks = new FreshCopyAsks();
  act(() => {
    mounted = mountWorkspaceWindow(element, {
      shell,
      switcher,
      platform: "windows",
      language: "en",
      freshCopyAsks: asks,
      ...(withDemo ? { sample: { create } } : {}),
    });
  });
  return { shell, create, asks, events };
}

/** Presses **Try again** on the newest toast that has it. */
async function tryAgain(shell: ReturnType<typeof createShell>) {
  const toast = shell.toasts.list().findLast((each) => each.action?.label === "Try again");
  await act(async () => toast?.action?.onClick());
}

verifies("workspace.fresh-copy-asks", () => {
  it("makes the demo chip's fresh copy when asked", async () => {
    const { shell, create, asks } = start(true);
    await act(async () => asks.ask());
    expect(create).toHaveBeenCalledWith([]);
    expect(shell.toasts.list().map((toast) => toast.title)).toContain(
      "Created Acme sample 2. Your old copy is still in Recent.",
    );
  });

  it("tells the asker once the copy is written, before it opens", async () => {
    const { asks, events } = start(true);
    await act(async () => asks.ask(() => events.push("told")));
    expect(events).toEqual(["told", "opened /docs/Acme sample 2"]);
  });

  it("tells the asker when the copy is there already", async () => {
    const { asks, events } = start(true, [{ kind: "existing", folder: copy.folder }]);
    await act(async () => asks.ask(() => events.push("told")));
    expect(events).toEqual(["told", "opened /docs/Acme sample 2"]);
  });

  it("never tells the asker when the copy can't be written, and says why", async () => {
    const { shell, asks, events } = start(true, [cant]);
    await act(async () => asks.ask(() => events.push("told")));
    expect(events).toEqual([]);
    expect(shell.toasts.list().some((toast) => toast.action?.label === "Try again")).toBe(true);
  });

  it("tells the asker once when Try again works, after two failures", async () => {
    const { shell, asks, events } = start(true, [cant, cant]);
    await act(async () => asks.ask(() => events.push("told")));
    await tryAgain(shell);
    expect(events).toEqual([]);
    await tryAgain(shell);
    await tryAgain(shell);
    expect(events.filter((event) => event === "told")).toEqual(["told"]);
    expect(events[0]).toBe("told");
  });

  it("does nothing without Open demo", async () => {
    const { shell, create, asks } = start(false);
    await act(async () => asks.ask());
    expect(create).not.toHaveBeenCalled();
    expect(shell.toasts.list()).toEqual([]);
  });
});
