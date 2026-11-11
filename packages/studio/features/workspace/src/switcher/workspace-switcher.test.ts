import { KindedError } from "@halonicjs/std";
import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import {
  folderName,
  MENU_BUSY_AFTER_MS,
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
        throw new KindedError("not_found", "No folder /work/old");
      },
    });

    expect(await switcher.openLocation("/work/old")).toEqual({
      folder: "/work/old",
      kind: "not_found",
      reason: "the folder is gone.",
    });
    expect(switcher.open.all).toEqual([]);
    expect(switcher.recent.list()).toEqual([]);
  });

  it("says why when the picker itself fails, with details when it can't explain", async () => {
    const { switcher } = setup({
      pickFolder: async () => {
        throw "pick_folder: no window";
      },
    });

    expect(await switcher.pickAndOpen()).toMatchObject({
      folder: "the folder",
      kind: "internal",
      reason: "Halonic ran into a problem it can't explain yet.",
      details: "Can't open the folder\nThrown: pick_folder: no window",
    });
  });

  it("shows a failure from the workspace menu as a danger toast over the shown workspace", async () => {
    const { switcher, toasts } = setup({
      openFolder: async (location) => {
        if (location === "/locked") {
          throw new KindedError("denied", "No access");
        }
        return opened("acme");
      },
    });
    await switcher.openLocation("/work/acme");

    await switcher.fromMenu(() => switcher.openLocation("/locked"));
    expect(switcher.open.shown?.location).toBe("/work/acme");
    const toast = toasts.list().at(-1);
    expect(toast).toMatchObject({
      tone: "danger",
      title: "Can't open /locked: you don't have permission to read it.",
    });
    expect(toast?.action).toBeUndefined();
  });

  it("offers Remove from Recent when a Recent row's folder is gone", async () => {
    const { switcher, toasts } = setup({
      openFolder: async (location) => {
        if (location === "/work/old") {
          throw new KindedError("not_found", "No folder /work/old");
        }
        return opened(folderName(location));
      },
    });
    switcher.recent.remember({ location: "/work/old", name: "old" });
    await switcher.openLocation("/work/acme");

    await switcher.fromMenu(() => switcher.openLocation("/work/old"), true);
    const toast = toasts.list().at(-1);
    expect(toast?.title).toBe("Can't open /work/old: the folder is gone.");
    expect(toast?.action?.label).toBe("Remove from Recent");
    expect(switcher.recent.list().map((each) => each.location)).toContain("/work/old");

    toast?.action?.onClick();
    expect(switcher.recent.list().map((each) => each.location)).toEqual(["/work/acme"]);
  });

  it("offers no Remove from Recent for a picked folder that's gone", async () => {
    const { switcher, toasts } = setup({
      pickFolder: async () => "/work/old",
      openFolder: async () => {
        throw new KindedError("not_found", "No folder /work/old");
      },
    });

    await switcher.fromMenu(() => switcher.pickAndOpen());
    expect(toasts.list().at(-1)?.action).toBeUndefined();
  });

  it("says the engine's own reason for any other kind", async () => {
    const { switcher, toasts } = setup({
      openFolder: async () => {
        throw new KindedError("unavailable", "The engine isn't answering");
      },
    });

    await switcher.fromMenu(() => switcher.openLocation("/work/acme"));
    expect(toasts.list().at(-1)?.title).toBe("Can't open /work/acme: The engine isn't answering.");
  });

  it("offers Copy details when it can't explain the failure", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { switcher, toasts } = setup({
      openFolder: async () => {
        throw new TypeError("services is undefined");
      },
    });

    await switcher.fromMenu(() => switcher.openLocation("/work/acme"));
    const toast = toasts.list().at(-1);
    expect(toast?.title).toBe(
      "Can't open /work/acme: Halonic ran into a problem it can't explain yet.",
    );
    expect(toast?.action?.label).toBe("Copy details");

    toast?.action?.onClick();
    await vi.waitFor(() => expect(titles(toasts)).toContain("Copied. Paste it into a bug report."));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Can't open /work/acme\nTypeError: services is undefined"),
    );
    vi.unstubAllGlobals();
  });
});

verifies("workspace.busy-switcher", () => {
  function slowOpen() {
    let finish: (workspace: OpenedWorkspace) => void = () => {};
    const setupResult = setup({
      openFolder: vi.fn(
        () =>
          new Promise<OpenedWorkspace>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    return { ...setupResult, finish: (workspace: OpenedWorkspace) => finish(workspace) };
  }

  it("turns busy 300 ms into an open and back when the workspace shows", async () => {
    vi.useFakeTimers();
    const { switcher, finish } = slowOpen();
    const changed = vi.fn();
    switcher.subscribe(changed);

    const opening = switcher.fromMenu(() => switcher.openLocation("/work/acme"));
    vi.advanceTimersByTime(MENU_BUSY_AFTER_MS - 1);
    expect(switcher.busy).toBe(false);
    vi.advanceTimersByTime(1);
    expect(switcher.busy).toBe(true);
    expect(changed).toHaveBeenCalledOnce();

    finish(opened("acme"));
    await opening;
    expect(switcher.busy).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("never turns busy for an open faster than 300 ms", async () => {
    vi.useFakeTimers();
    const { switcher } = setup();
    const changed = vi.fn();
    switcher.subscribe(changed);

    await switcher.fromMenu(() => switcher.openLocation("/work/acme"));
    vi.advanceTimersByTime(MENU_BUSY_AFTER_MS);
    expect(switcher.busy).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("stops being busy when the open fails, as its toast appears", async () => {
    vi.useFakeTimers();
    let fail: (error: unknown) => void = () => {};
    const { switcher, toasts } = setup({
      openFolder: () =>
        new Promise<OpenedWorkspace>((_, reject) => {
          fail = reject;
        }),
    });

    const opening = switcher.fromMenu(() => switcher.openLocation("/work/old"));
    vi.advanceTimersByTime(MENU_BUSY_AFTER_MS);
    expect(switcher.busy).toBe(true);
    fail(new KindedError("not_found", "No folder /work/old"));
    await opening;
    expect(switcher.busy).toBe(false);
    expect(titles(toasts)).toEqual(["Can't open /work/old: the folder is gone."]);
    vi.useRealTimers();
  });

  it("ignores another open from the menu meanwhile", async () => {
    const { switcher, options, finish } = slowOpen();

    const first = switcher.fromMenu(() => switcher.openLocation("/work/acme"));
    await switcher.fromMenu(() => switcher.pickAndOpen());
    finish(opened("acme"));
    await first;
    expect(options.openFolder).toHaveBeenCalledOnce();
    expect(options.pickFolder).not.toHaveBeenCalled();
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
