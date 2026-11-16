// @vitest-environment jsdom
import type { ItemUsage } from "@halonicjs/app";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type LibraryItemsHost,
  LibraryItemsHostService,
  type LibraryListing,
} from "../library-items-host.ts";
import { type SkillHost, SkillHostService } from "../skill-host.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryPage } from "./library-page.tsx";
import { SkillPage } from "./skill-page.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restorePopover();
});

const nobody: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };
const usedBySupport: ItemUsage = {
  ...nobody,
  agents: [{ id: "support", name: "Support", hub: null }],
};

function listing(usage: ItemUsage): LibraryListing {
  return {
    hubs: [],
    shared: { workspaceName: "Acme", entries: [{ id: "tone", name: "Tone", usage }] },
  };
}

function itemsHost(usage: ItemUsage, remove?: LibraryItemsHost["remove"]) {
  const undo = vi.fn(async () => {});
  const host: LibraryItemsHost = {
    list: async () => listing(usage),
    remove: remove ?? vi.fn(async () => ({ undo })),
    subscribe: () => () => {},
  };
  return { host, undo };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pick(root: ParentNode, trigger: string, entry: string): Promise<void> {
  act(() => root.querySelector<HTMLElement>(`button[aria-label="${trigger}"]`)?.click());
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (each) => each.textContent === entry,
  );
  await act(async () => item?.click());
  await settled();
}

async function showLibrary(host: LibraryItemsHost) {
  const toasts = createToastStore();
  const page = render(
    <ToastStoreProvider store={toasts}>
      <LibraryPage
        host={host}
        kind="skill"
        onKindChange={() => undefined}
        onOpen={() => undefined}
        onOpenInNewTab={() => undefined}
      />
    </ToastStoreProvider>,
  );
  await settled();
  return { page, toasts };
}

verifies("library.library-delete", () => {
  it("deletes from a row with no dialog and says who uses it, with Undo", async () => {
    const { host, undo } = itemsHost(usedBySupport);
    const { page, toasts } = await showLibrary(host);
    await pick(page, "More actions for Tone", "Delete");
    expect(host.remove).toHaveBeenCalledWith("skill", { hub: null, id: "tone" });
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(toasts.list()[0]).toMatchObject({
      title: "Moved Tone to the trash",
      text: "Used by Support",
      action: { label: "Undo" },
    });
    await act(async () => toasts.list()[0]?.action?.onClick());
    expect(undo).toHaveBeenCalledOnce();
    expect(toasts.list().at(-1)?.title).toBe("Put Tone back");
  });

  it("gives an item nobody uses no second line", async () => {
    const { host } = itemsHost(nobody);
    const { page, toasts } = await showLibrary(host);
    await pick(page, "More actions for Tone", "Delete");
    expect(toasts.list()[0]?.text).toBeUndefined();
  });

  it("says why a delete failed, and shows no system message", async () => {
    const { host } = itemsHost(nobody, async () => {
      throw new Error("Tone isn't in this workspace any more.");
    });
    const { page, toasts } = await showLibrary(host);
    await pick(page, "More actions for Tone", "Delete");
    expect(toasts.list()[0]).toMatchObject({ tone: "danger", title: "Couldn't delete Tone" });
  });

  it("deletes from an open page and shows the strip with Undo, not the gone state", async () => {
    const { host, undo } = itemsHost(usedBySupport);
    let gone = false;
    const skills: SkillHost = {
      read: async () =>
        gone
          ? undefined
          : { text: "---\nname: Tone\ndescription: How we write\n---\nPlain.\n", files: [] },
      write: async () => {},
      usage: async () => usedBySupport,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const listeners = new Set<() => void>();
    const remove = vi.fn(async () => {
      gone = true;
      for (const listener of listeners) listener();
      return {
        undo: async () => {
          gone = false;
          await undo();
          for (const listener of listeners) listener();
        },
      };
    });
    host.remove = remove;
    const provided = new Map<unknown, unknown>([
      [SkillHostService, skills],
      [LibraryItemsHostService, host],
    ]);
    const props = {
      item: { kind: "skill", hub: "~workspace", id: "tone" },
      context: {
        services: {
          get: (key: unknown) => provided.get(key),
          find: (key: unknown) => provided.get(key),
        },
        announcer: { announceState: vi.fn() },
        openPlace: vi.fn(),
      },
      Sections: () => null,
    } as unknown as ItemViewProps;
    const toasts = createToastStore();
    const page = render(
      <ToastStoreProvider store={toasts}>
        <SkillPage {...props} />
      </ToastStoreProvider>,
    );
    await settled();
    await pick(page, "More actions for Tone", "Delete");
    expect(remove).toHaveBeenCalledWith("skill", { hub: null, id: "tone" });
    expect(page.textContent).toContain("Moved Tone to the trash");
    expect(page.textContent).not.toContain("isn't in this workspace any more");
    const undoButton = [...page.querySelectorAll("button")].find((b) => b.textContent === "Undo");
    await act(async () => undoButton?.click());
    await settled();
    expect(undo).toHaveBeenCalledOnce();
    expect(page.querySelector("h1")?.textContent).toBe("Tone");
    expect(page.textContent).not.toContain("Moved Tone to the trash");
  });
});
