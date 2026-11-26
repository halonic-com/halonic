import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import { folderName, type OpenedWorkspace, WorkspaceSwitcher } from "./workspace-switcher.ts";

/** A `localStorage` stand-in that keeps its items in a map. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/**
 * A switcher whose app opens `/work/acme` only once {@link release} is called, as an engine still
 * starting does, and every other folder at once; `opens` counts each folder's opens.
 */
function setup() {
  let release: () => void = () => {};
  const acmeHeld = new Promise<void>((resolve) => {
    release = resolve;
  });
  const opens: string[] = [];
  const disposed: string[] = [];
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => "/work/beta",
    openFolder: async (location): Promise<OpenedWorkspace> => {
      opens.push(location);
      if (location === "/work/acme") await acmeHeld;
      const workspace = { dispose: vi.fn() } as unknown as StudioWorkspace;
      const dispose = async () => {
        disposed.push(location);
      };
      return { name: folderName(location), workspace, dispose };
    },
    recent: new RecentWorkspaces(memoryStorage()),
    toasts: createToastStore(),
  });
  return { switcher, release, opens, disposed };
}

verifies("workspace.reopen-gives-way", () => {
  it("names the folder it reopens at start, and shows it once open", async () => {
    const { switcher, release } = setup();

    const reopened = switcher.reopenOnStart("/work/acme");
    expect(switcher.reopening).toBe("/work/acme");
    release();

    expect(await reopened).toBeUndefined();
    expect(switcher.reopening).toBeUndefined();
    expect(switcher.open.shown?.location).toBe("/work/acme");
  });

  it("opens the folder picked while it reopens, and never shows the reopened one", async () => {
    const { switcher, release, disposed } = setup();
    const reopened = switcher.reopenOnStart("/work/acme");

    expect(await switcher.pickAndOpen()).toBeUndefined();
    expect(switcher.open.shown?.location).toBe("/work/beta");
    expect(switcher.reopening).toBeUndefined();
    release();
    await reopened;

    expect(switcher.open.all.map((slot) => slot.location)).toEqual(["/work/beta"]);
    expect(disposed).toEqual(["/work/acme"]);
  });

  it("opens another Recent row while it reopens, rather than ignoring the press", async () => {
    const { switcher, release } = setup();
    const reopened = switcher.reopenOnStart("/work/acme");

    expect(await switcher.openLocation("/work/beta")).toBeUndefined();
    expect(switcher.open.shown?.location).toBe("/work/beta");
    release();
    await reopened;

    expect(switcher.open.shown?.location).toBe("/work/beta");
  });

  it("opens the same folder once when the person asks for the one it reopens", async () => {
    const { switcher, release, opens } = setup();
    void switcher.reopenOnStart("/work/acme");

    const opened = switcher.openLocation("/work/acme");
    release();

    expect(await opened).toBeUndefined();
    expect(opens).toEqual(["/work/acme"]);
    expect(switcher.open.shown?.location).toBe("/work/acme");
  });

  it("doesn't reopen while the person's folder is opening", async () => {
    const { switcher, release, opens } = setup();
    const opening = switcher.openLocation("/work/acme");

    expect(await switcher.reopenOnStart("/work/beta")).toBeUndefined();
    release();
    await opening;

    expect(opens).toEqual(["/work/acme"]);
  });
});
