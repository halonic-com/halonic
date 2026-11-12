import { KindedError } from "@halonicjs/std";
import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import {
  folderName,
  type OpenedWorkspace,
  WorkspaceSwitcher,
  type WorkspaceSwitcherOptions,
} from "./workspace-switcher.ts";

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

/** A switcher whose app keeps, in `steps`, each reopen, forget and open, in order. */
function setup(overrides: Partial<WorkspaceSwitcherOptions> = {}) {
  const steps: string[] = [];
  const toasts = createToastStore();
  const options: WorkspaceSwitcherOptions = {
    pickFolder: async () => "/work/acme",
    openFolder: async (location): Promise<OpenedWorkspace> => {
      steps.push(`open ${location}`);
      const workspace = { dispose: vi.fn() } as unknown as StudioWorkspace;
      return { name: folderName(location), workspace, dispose: async () => {} };
    },
    reopenFolder: async (location) => {
      steps.push(`reopen ${location}`);
    },
    forgetFolder: async (location) => {
      steps.push(`forget ${location}`);
    },
    recent: new RecentWorkspaces(memoryStorage()),
    toasts,
    ...overrides,
  };
  return { switcher: new WorkspaceSwitcher(options), steps, toasts };
}

verifies("workspace.recent-reopens-picked-folder", () => {
  it("reopens a Recent row's folder before opening the workspace in it", async () => {
    const { switcher, steps } = setup();
    switcher.recent.remember({ location: "/work/acme", name: "acme" });

    expect(await switcher.openLocation("/work/acme")).toBeUndefined();
    expect(steps).toEqual(["reopen /work/acme", "open /work/acme"]);
    expect(switcher.open.shown?.value.name).toBe("acme");
  });

  it("doesn't reopen a folder that is already open, nor one just picked", async () => {
    const { switcher, steps } = setup();
    await switcher.pickAndOpen();
    await switcher.openLocation("/work/acme");
    expect(steps).toEqual(["open /work/acme"]);
  });

  it("opens nothing when the folder can't be reopened, and says the folder is gone", async () => {
    const { switcher, steps } = setup({
      reopenFolder: async () => {
        throw new KindedError("not_found", "The shell refused: gone");
      },
    });
    switcher.recent.remember({ location: "/work/old", name: "old" });

    expect(await switcher.openLocation("/work/old")).toEqual({
      folder: "/work/old",
      kind: "not_found",
      reason: "the folder is gone.",
    });
    expect(steps).toEqual([]);
    expect(switcher.open.all).toEqual([]);
  });

  it("offers Remove from Recent from the menu, which forgets the folder too", async () => {
    const { switcher, steps, toasts } = setup({
      reopenFolder: async (location) => {
        if (location === "/work/old") {
          throw new KindedError("not_found", "The shell refused: gone");
        }
      },
    });
    switcher.recent.remember({ location: "/work/old", name: "old" });
    await switcher.openLocation("/work/acme");

    await switcher.fromMenu(() => switcher.openLocation("/work/old"), true);
    const toast = toasts.list().at(-1);
    expect(toast?.title).toBe("Can't open /work/old: the folder is gone.");
    toast?.action?.onClick();
    expect(switcher.recent.list().map((each) => each.location)).toEqual(["/work/acme"]);
    expect(steps.at(-1)).toBe("forget /work/old");
  });

  it("forgets a removed row's folder, unless it is open in the window", async () => {
    const { switcher, steps } = setup();
    await switcher.pickAndOpen();
    switcher.recent.remember({ location: "/work/old", name: "old" });

    switcher.removeFromRecent("/work/old");
    switcher.removeFromRecent("/work/acme");
    expect(switcher.recent.list()).toEqual([]);
    expect(steps).toEqual(["open /work/acme", "forget /work/old"]);
  });

  it("removes the row even when forgetting the folder fails", async () => {
    const forgetFolder = vi.fn(async () => {
      throw new KindedError("unavailable", "The desktop shell gave no answer about the folder.");
    });
    const { switcher } = setup({ forgetFolder });
    switcher.recent.remember({ location: "/work/old", name: "old" });

    switcher.removeFromRecent("/work/old");
    await Promise.resolve();
    expect(switcher.recent.list()).toEqual([]);
    expect(forgetFolder).toHaveBeenCalledWith("/work/old");
  });
});
