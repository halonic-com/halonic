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

/** An error with a kind, as the host throws: its message is safe to show. */
function kinded(kind: string, message: string): Error {
  return Object.assign(new Error(message), { kind });
}

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

verifies("library.library-open-as-file", () => {
  it("opens a row's file from its menu", async () => {
    const { host } = itemsHost(nobody);
    const onOpenAsFile = vi.fn();
    const page = render(
      <ToastStoreProvider store={createToastStore()}>
        <LibraryPage
          host={host}
          kind="skill"
          onKindChange={() => undefined}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
          onOpenAsFile={onOpenAsFile}
        />
      </ToastStoreProvider>,
    );
    await settled();
    await pick(page, "More actions for Tone", "Open as file");
    expect(onOpenAsFile).toHaveBeenCalledWith("skill", { hub: null, id: "tone" });
  });

  it("offers no Open as file when the app can't open a tab", async () => {
    const { host } = itemsHost(nobody);
    const { page } = await showLibrary(host);
    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Tone"]')?.click(),
    );
    const entries = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
    expect(entries).toEqual(["Delete"]);
  });

  it("opens an open page's file from its menu", async () => {
    const { host } = itemsHost(nobody);
    const skills: SkillHost = {
      read: async () => ({
        text: "---\nname: Tone\ndescription: How we write\n---\nPlain.\n",
        files: [],
      }),
      write: async () => {},
      usage: async () => nobody,
      subscribe: () => () => {},
    };
    const provided = new Map<unknown, unknown>([
      [SkillHostService, skills],
      [LibraryItemsHostService, host],
    ]);
    const openItem = vi.fn();
    const props = {
      item: { kind: "skill", hub: "~workspace", id: "tone" },
      context: {
        services: {
          get: (key: unknown) => provided.get(key),
          find: (key: unknown) => provided.get(key),
        },
        announcer: { announceState: vi.fn() },
        openPlace: vi.fn(),
        openItem,
      },
      Sections: () => null,
    } as unknown as ItemViewProps;
    const page = render(
      <ToastStoreProvider store={createToastStore()}>
        <SkillPage {...props} />
      </ToastStoreProvider>,
    );
    await settled();
    await pick(page, "More actions for Tone", "Open as file");
    expect(openItem).toHaveBeenCalledWith({
      kind: "file",
      hub: "workspace",
      id: "library/skills/tone/SKILL.md",
    });
  });
});
