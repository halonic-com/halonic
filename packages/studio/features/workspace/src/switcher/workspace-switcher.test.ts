import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
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

function opened(name: string): OpenedWorkspace & { readonly disposed: () => boolean } {
  let disposed = false;
  return {
    name,
    workspace: { dispose: vi.fn() } as unknown as StudioWorkspace,
    dispose: async () => {
      disposed = true;
    },
    disposed: () => disposed,
  };
}

function setup(overrides: Partial<WorkspaceSwitcherOptions> = {}) {
  const toasts = createToastStore();
  const options: WorkspaceSwitcherOptions = {
    pickFolder: vi.fn(async () => "/work/acme"),
    openFolder: vi.fn(async (location: string) => opened(folderName(location))),
    recent: new RecentWorkspaces(memoryStorage()),
    toasts,
    ...overrides,
  };
  return { switcher: new WorkspaceSwitcher(options), options, toasts };
}

function titles(toasts: ReturnType<typeof createToastStore>): readonly string[] {
  return toasts.list().map((toast) => toast.title);
}

verifies("workspace.open-folder", () => {
  it("opens the picked folder, shows it, remembers it and says so", async () => {
    const { switcher, toasts } = setup();

    expect(await switcher.pickAndOpen()).toBeUndefined();
    expect(switcher.open.shown?.value.name).toBe("acme");
    expect(switcher.recent.list()).toEqual([{ location: "/work/acme", name: "acme" }]);
    expect(titles(toasts)).toEqual(["Opened acme"]);
  });

  it("shows a folder that is already open instead of opening it again", async () => {
    const { switcher, options } = setup();
    await switcher.openLocation("/work/acme");
    await switcher.openLocation("/work/beta");

    await switcher.openLocation("/work/acme");
    expect(options.openFolder).toHaveBeenCalledTimes(2);
    expect(switcher.open.all.map((slot) => slot.location)).toEqual(["/work/acme", "/work/beta"]);
    expect(switcher.open.shown?.location).toBe("/work/acme");
    expect(switcher.recent.list()[0]?.location).toBe("/work/acme");
  });

  it("ignores another open while one is running", async () => {
    let finish: (workspace: OpenedWorkspace) => void = () => {};
    const { switcher, options } = setup({
      openFolder: vi.fn(
        () =>
          new Promise<OpenedWorkspace>((resolve) => {
            finish = resolve;
          }),
      ),
    });

    const first = switcher.openLocation("/work/acme");
    expect(await switcher.openLocation("/work/beta")).toBeUndefined();
    expect(await switcher.pickAndOpen()).toBeUndefined();
    finish(opened("acme"));
    await first;

    expect(options.openFolder).toHaveBeenCalledOnce();
    expect(options.pickFolder).not.toHaveBeenCalled();
  });
});

verifies("workspace.failed-open-leaves-no-slot", () => {
  it("adds nothing and says nothing when the picker is cancelled", async () => {
    const { switcher, toasts } = setup({ pickFolder: async () => undefined });

    expect(await switcher.pickAndOpen()).toBeUndefined();
    expect(switcher.open.all).toEqual([]);
    expect(toasts.list()).toEqual([]);
  });

  it("adds no slot for a folder that fails, and says why", async () => {
    const { switcher } = setup({
      openFolder: async () => {
        throw new Error("the folder is gone");
      },
    });

    expect(await switcher.openLocation("/work/old")).toEqual({
      folder: "/work/old",
      reason: "the folder is gone.",
    });
    expect(switcher.open.all).toEqual([]);
    expect(switcher.recent.list()).toEqual([]);
  });

  it("says why when the picker itself fails", async () => {
    const { switcher } = setup({
      pickFolder: async () => {
        throw "The folder picker didn't open.";
      },
    });

    expect(await switcher.pickAndOpen()).toEqual({
      folder: "the folder",
      reason: "The folder picker didn't open.",
    });
  });

  it("shows a failure from the workspace menu as an error toast over the shown workspace", async () => {
    const { switcher, toasts } = setup({
      openFolder: async (location) => {
        if (location === "/missing") {
          throw new Error("No folder /missing");
        }
        return opened("acme");
      },
    });
    await switcher.openLocation("/work/acme");

    await switcher.fromMenu(() => switcher.openLocation("/missing"));
    expect(switcher.open.shown?.location).toBe("/work/acme");
    expect(toasts.list().at(-1)).toMatchObject({
      tone: "danger",
      title: "Can't open /missing: No folder /missing.",
    });
  });
});

describe("closing", () => {
  it("closes the shown workspace, stops it and shows the next (workspace.switcher.close-keeps-a-slot)", async () => {
    const acme = opened("Acme");
    const { switcher } = setup({
      openFolder: async (location) => (location === "/work/acme" ? acme : opened("Beta")),
    });
    await switcher.openLocation("/work/acme");
    await switcher.openLocation("/work/beta");
    switcher.showAt(1);

    await switcher.closeShown();
    expect(acme.disposed()).toBe(true);
    expect(acme.workspace.dispose).toHaveBeenCalledOnce();
    expect(switcher.open.shown?.location).toBe("/work/beta");
    await switcher.closeShown();
    expect(switcher.open.shown).toBeUndefined();
    await switcher.closeShown();
  });

  it("stops every workspace when the window goes", async () => {
    const acme = opened("Acme");
    const beta = opened("Beta");
    const { switcher } = setup({
      openFolder: async (location) => (location === "/work/acme" ? acme : beta),
    });
    await switcher.openLocation("/work/acme");
    await switcher.openLocation("/work/beta");

    await switcher.dispose();
    expect([acme.disposed(), beta.disposed()]).toEqual([true, true]);
    expect(switcher.open.all).toEqual([]);
  });
});

describe("showAt", () => {
  it("remembers the workspace it shows, and nothing past the last", async () => {
    const { switcher } = setup();
    await switcher.openLocation("/work/acme");
    await switcher.openLocation("/work/beta");

    switcher.showAt(1);
    switcher.showAt(9);
    expect(switcher.open.shown?.location).toBe("/work/acme");
    expect(switcher.recent.list().map((each) => each.name)).toEqual(["acme", "beta"]);
  });
});

describe("folderName", () => {
  it("is the folder's last part, on any system", () => {
    expect(folderName("/work/acme")).toBe("acme");
    expect(folderName("/work/acme/")).toBe("acme");
    expect(folderName("Work\\Acme Support")).toBe("Acme Support");
    expect(folderName("/")).toBe("/");
  });
});
