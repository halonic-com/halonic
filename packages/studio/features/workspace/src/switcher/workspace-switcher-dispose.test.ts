import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { describe, expect, it, vi } from "vitest";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import type { WorkspaceSaving } from "./workspace-saving.ts";
import { type OpenedWorkspace, WorkspaceSwitcher } from "./workspace-switcher.ts";

/** An open workspace whose saving answers `saveNow` with `answer` and logs the order of calls. */
function openedWithSaving(name: string, answer: boolean, order: string[]) {
  let disposed = false;
  const saving = {
    saveNow: async () => {
      order.push(`save ${name}`);
      return answer;
    },
    dispose: () => order.push(`dispose ${name}`),
  } as unknown as WorkspaceSaving;
  const workspace: OpenedWorkspace = {
    name,
    workspace: { dispose: vi.fn() } as unknown as StudioWorkspace,
    saving,
    dispose: async () => {
      disposed = true;
    },
  };
  return { workspace, disposed: () => disposed };
}

describe("when the window goes", () => {
  it("saves what is waiting in every workspace first, even when one save fails", async () => {
    const order: string[] = [];
    const acme = openedWithSaving("Acme", false, order);
    const beta = openedWithSaving("Beta", true, order);
    const switcher = new WorkspaceSwitcher({
      pickFolder: async () => undefined,
      openFolder: async (location) => (location === "/work/acme" ? acme : beta).workspace,
      recent: new RecentWorkspaces({ getItem: () => null, setItem: () => {} }),
      toasts: createToastStore(),
    });
    await switcher.openLocation("/work/acme");
    await switcher.openLocation("/work/beta");

    await switcher.dispose();
    expect(order).toEqual(["save Acme", "dispose Acme", "save Beta", "dispose Beta"]);
    expect([acme.disposed(), beta.disposed()]).toEqual([true, true]);
  });
});

describe("when the window asks to close", () => {
  async function switcherWith(acme: boolean, beta: boolean) {
    const order: string[] = [];
    const opened = {
      "/work/acme": openedWithSaving("Acme", acme, order),
      "/work/beta": openedWithSaving("Beta", beta, order),
    };
    const switcher = new WorkspaceSwitcher({
      pickFolder: async () => undefined,
      openFolder: async (location) => opened[location as keyof typeof opened].workspace,
      recent: new RecentWorkspaces({ getItem: () => null, setItem: () => {} }),
      toasts: createToastStore(),
    });
    await switcher.openLocation("/work/acme");
    await switcher.openLocation("/work/beta");
    return { switcher, opened };
  }

  it("says it can close, and asks nothing, when every save works", async () => {
    const { switcher } = await switcherWith(true, true);
    expect(await switcher.saveAllForWindowClose()).toBe(true);
    expect(switcher.closeRequest).toBeUndefined();
  });

  it('keeps everything open and asks "Close Acme?" when a save fails', async () => {
    const { switcher, opened } = await switcherWith(false, true);
    expect(await switcher.saveAllForWindowClose()).toBe(false);
    expect(switcher.closeRequest).toMatchObject({ location: "/work/acme", name: "Acme" });
    expect(switcher.open.shown?.location).toBe("/work/acme");
    expect([opened["/work/acme"].disposed(), opened["/work/beta"].disposed()]).toEqual([
      false,
      false,
    ]);
  });
});
