// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CreatedSample } from "../sample/sample-host.ts";
import { type MountedWorkspaceWindow, mountWorkspaceWindow } from "./mount-workspace-window.tsx";
import { RecentWorkspaces, type RememberedWorkspace } from "./recent-workspaces.ts";
import { folderName, WorkspaceSwitcher } from "./workspace-switcher.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let mounted: MountedWorkspaceWindow | undefined;
let restore: () => void = () => {};

/** A desktop window as narrow as a phone: every `(width < Npx)` query matches. */
beforeEach(() => {
  const media = window.matchMedia;
  // jsdom has no popovers, which a menu closes itself with.
  HTMLElement.prototype.hidePopover ??= () => {};
  window.matchMedia = (query) =>
    ({
      media: query,
      matches: /\(width < \d+px\)/.test(query),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  restore = () => {
    window.matchMedia = media;
  };
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
  restore();
});

const sample: RememberedWorkspace = {
  location: "/docs/Acme sample",
  name: "Acme sample",
  sample: true,
};
const beta: RememberedWorkspace = { location: "/work/Beta", name: "Beta" };

/** The desktop app's window, narrow, showing the remembered sample with Beta in Recent. */
async function start() {
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
  const storage = new Map([["halonic.workspace.recent", JSON.stringify([sample, beta])]]);
  const made: CreatedSample = {
    kind: "created",
    folder: "/docs/Acme sample 2",
    name: "Acme sample 2",
    trust: { kind: "trusted" },
  };
  const create = vi.fn(async (_known: readonly string[]) => made);
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => undefined,
    openFolder: async (location) => {
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
      // Only its row is looked at here; the dialog it opens has its own tests.
      newWorkspace: {
        defaultParent: () => new Promise(() => {}),
        folderOf: (parent, name) => `${parent}/${name}`,
        probe: async () => ({ kind: "missing" }) as never,
        create: async () => ({ kind: "trusted" }),
      },
    });
  });
  await act(async () => switcher.openLocation(sample.location));
  const more = [...element.querySelectorAll("a, button")].find(
    (each) => each.textContent?.trim() === "More",
  );
  await act(async () => (more as HTMLElement | undefined)?.click());
  return { switcher, create };
}

const workspaceRow = () =>
  element.querySelector<HTMLButtonElement>('button[aria-label^="Workspace: "]');
const chip = () =>
  element.querySelector<HTMLButtonElement>('button[aria-label="Sample, test model"]');
const sheetTitle = () => element.querySelector(".fixed h2")?.textContent;

async function pressSheetRow(label: string): Promise<void> {
  const row = [...element.querySelectorAll<HTMLButtonElement>(".fixed li > button")].find((each) =>
    each.textContent?.startsWith(label),
  );
  await act(async () => row?.click());
}

verifies("workspace.narrow-window", () => {
  it("keeps the workspace row and the sample chip on More", async () => {
    await start();

    expect(workspaceRow()?.getAttribute("aria-label")).toBe(
      "Workspace: Acme sample. Change workspace",
    );
    expect(chip()).not.toBeNull();
    // The person is on a computer already (HAL-12962).
    expect(element.textContent).toContain("Editing workflows is easier in a wider window.");
  });

  it("opens the workspace menu as a sheet, and a row closes it and switches", async () => {
    const { switcher } = await start();

    await act(async () => workspaceRow()?.click());
    expect(sheetTitle()).toBe("Workspace");
    // The menu's heading stays as the sheet's section label (HAL-12962).
    expect(element.querySelector(".fixed h3")?.textContent).toBe("Recent");
    await pressSheetRow("Beta");

    expect(sheetTitle()).toBeUndefined();
    expect(switcher.open.shown?.location).toBe(beta.location);
  });

  it("opens the chip's rows as a sheet, and Fresh copy asks the host for one", async () => {
    const { create } = await start();

    await act(async () => chip()?.click());
    expect(sheetTitle()).toBe("Sample · test model");
    expect(element.querySelector(".fixed")?.textContent).toContain("New workspace…");
    await pressSheetRow("Fresh copy of the sample");

    expect(sheetTitle()).toBeUndefined();
    expect(create).toHaveBeenCalledWith([]);
  });
});
