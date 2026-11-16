// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore } from "@halonicjs/studio-kit";
import { createShell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type MountedWorkspaceWindow,
  mountWorkspaceWindow,
} from "../switcher/mount-workspace-window.tsx";
import { RecentWorkspaces } from "../switcher/recent-workspaces.ts";
import { folderName, WorkspaceSwitcher } from "../switcher/workspace-switcher.ts";
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

/** The window on Welcome, with a sample host that answers `made`. */
function start(made: CreatedSample) {
  const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
  const storage = new Map<string, string>();
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
      sample: { create: async () => made },
    });
  });
  return shell;
}

function trySample(): HTMLButtonElement | undefined {
  return [...element.querySelectorAll("button")].find((each) =>
    each.textContent?.includes("Try the Acme sample"),
  );
}

verifies("workspace.try-sample", () => {
  it("opens the sample with the toast Created Acme sample", async () => {
    const shell = start({
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
    const shell = start({ kind: "cant", folder: "~/Documents", reason: "permission denied" });

    await act(async () => trySample()?.click());

    expect(element.textContent).toContain(
      "Can't create the sample in ~/Documents: permission denied.",
    );
    expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio");
    expect(shell.toasts.list()).toEqual([]);
  });
});
