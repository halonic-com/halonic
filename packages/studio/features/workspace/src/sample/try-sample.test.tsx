// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type MountedWorkspaceWindow,
  mountWorkspaceWindow,
} from "../switcher/mount-workspace-window.tsx";
import { RecentWorkspaces, type RememberedWorkspace } from "../switcher/recent-workspaces.ts";
import { folderName, WorkspaceSwitcher } from "../switcher/workspace-switcher.ts";
import type { CreatedSample } from "./sample-host.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let mounted: MountedWorkspaceWindow | undefined;

beforeEach(() => {
  // jsdom has no popovers, which a menu closes itself with.
  HTMLElement.prototype.hidePopover ??= () => {};
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

/** The window with a sample host that answers `made`, on Welcome unless `remembered` shows it. */
function start(made: CreatedSample, remembered: readonly RememberedWorkspace[] = []) {
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
  const storage = new Map<string, string>(
    remembered.length === 0 ? [] : [["halonic.workspace.recent", JSON.stringify(remembered)]],
  );
  const create = vi.fn(async (_known: readonly string[]) => made);
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => undefined,
    openFolder: async (location) => {
      if (location === "") throw new KindedError("not_found", "No folder");
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
  act(() => {
    mounted = mountWorkspaceWindow(element, {
      shell,
      switcher,
      platform: "windows",
      language: "en",
      sample: { create },
    });
  });
  return { shell, create };
}

function chip(): HTMLButtonElement | undefined {
  return [...element.querySelectorAll("button")].find((each) =>
    each.textContent?.includes("Sample · test model"),
  );
}

function trySample(): HTMLButtonElement | undefined {
  return [...element.querySelectorAll("button")].find((each) =>
    each.textContent?.includes("Try the Acme sample"),
  );
}

verifies("workspace.try-sample", () => {
  it("opens the sample with the toast Created Acme sample", async () => {
    const { shell } = start({
      kind: "created",
      folder: "/docs/Acme sample",
      name: "Acme sample",
      trust: { kind: "trusted" },
    });

    await act(async () => trySample()?.click());

    expect(
      element.querySelector('button[aria-label^="Workspace: "]')?.getAttribute("aria-label"),
    ).toBe("Workspace: Acme sample");
    expect(shell.toasts.list().map((toast) => toast.title)).toEqual(["Created Acme sample"]);
  });

  it("says why on Welcome and opens nothing when it can't", async () => {
    const { shell } = start({
      kind: "cant",
      folder: "~/Documents",
      reason: "permission denied",
    });

    await act(async () => trySample()?.click());

    expect(element.textContent).toContain(
      "Can't create the sample in ~/Documents: permission denied.",
    );
    expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio");
    expect(shell.toasts.list()).toEqual([]);
  });

  it("remembers the new folder as the sample and shows the chip, not a trust badge", async () => {
    const { create } = start({
      kind: "created",
      folder: "/docs/Acme sample",
      name: "Acme sample",
      trust: { kind: "trusted" },
    });

    await act(async () => trySample()?.click());

    expect(create).toHaveBeenCalledWith([]);
    expect(chip()?.textContent).toBe("Sample · test model");
  });

  it("shows no chip for a workspace that is not remembered as a sample", async () => {
    start({ kind: "cant", folder: "~/Documents", reason: "x" }, [
      { location: "/work/acme", name: "Acme" },
    ]);

    await act(async () => element.querySelector<HTMLButtonElement>("li button")?.click());

    expect(element.querySelector('button[aria-label^="Workspace: "]')).not.toBeNull();
    expect(chip()).toBeUndefined();
  });

  it("hands the host the known samples and reopens one without a Created toast", async () => {
    const known = { location: "/docs/Acme sample", name: "Acme", sample: true } as const;
    const { shell, create } = start({ kind: "existing", folder: known.location }, [known]);

    await act(async () => trySample()?.click());

    expect(create).toHaveBeenCalledWith([known.location]);
    expect(shell.toasts.list().map((toast) => toast.title)).toEqual(["Opened Acme sample"]);
    expect(chip()).toBeDefined();
  });

  it("Fresh copy writes a new copy asked with no known samples and says the old one stays", async () => {
    const known = { location: "/docs/Acme sample", name: "Acme", sample: true } as const;
    const { shell, create } = start(
      {
        kind: "created",
        folder: "/docs/Acme sample 2",
        name: "Acme sample 2",
        trust: { kind: "trusted" },
      },
      [known],
    );
    await act(async () => element.querySelector<HTMLButtonElement>("li button")?.click());

    await act(async () => chip()?.click());
    const row = [...document.querySelectorAll('[role="menuitem"]')].find((each) =>
      each.textContent?.includes("Fresh copy of the sample"),
    );
    await act(async () => (row as HTMLElement | undefined)?.click());

    expect(create).toHaveBeenCalledWith([]);
    expect(shell.toasts.list().map((toast) => toast.title)).toContain(
      "Created Acme sample 2. Your earlier copy is still in Recent.",
    );
  });

  it("says in a toast why Fresh copy couldn't write", async () => {
    const known = { location: "/docs/Acme sample", name: "Acme", sample: true } as const;
    const { shell } = start({ kind: "cant", folder: "~/Documents", reason: "permission denied" }, [
      known,
    ]);
    await act(async () => element.querySelector<HTMLButtonElement>("li button")?.click());

    await act(async () => chip()?.click());
    const row = [...document.querySelectorAll('[role="menuitem"]')].find((each) =>
      each.textContent?.includes("Fresh copy of the sample"),
    );
    await act(async () => (row as HTMLElement | undefined)?.click());

    expect(shell.toasts.list().map((toast) => toast.title)).toContain(
      "Couldn't create a fresh copy of the sample: permission denied.",
    );
    expect(shell.toasts.list().find((toast) => toast.sticky === true)?.action?.label).toBe(
      "Try again",
    );
  });
});
