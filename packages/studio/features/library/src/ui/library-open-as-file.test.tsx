// @vitest-environment jsdom
import type { ItemUsage } from "@halonicjs/app";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { ItemViewProps, PlaceViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type LibraryItemsHost,
  LibraryItemsHostService,
  type LibraryListing,
} from "../library-items-host.ts";
import { LibraryTabMemoryService } from "../library-tab-memory.ts";
import { type SkillHost, SkillHostService } from "../skill-host.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryPage } from "./library-page.tsx";
import { LibraryPlace } from "./library-place.tsx";
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

function skillPageProps(openItem: () => void): ItemViewProps {
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
  return {
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

  it("lists a row's entries in the spec's order and opens from them", async () => {
    const { host } = itemsHost(nobody);
    const onOpen = vi.fn();
    const onOpenInNewTab = vi.fn();
    const page = render(
      <ToastStoreProvider store={createToastStore()}>
        <LibraryPage
          host={host}
          kind="skill"
          onKindChange={() => undefined}
          onOpen={onOpen}
          onOpenInNewTab={onOpenInNewTab}
          onOpenAsFile={() => undefined}
        />
      </ToastStoreProvider>,
    );
    await settled();
    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Tone"]')?.click(),
    );
    const entries = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
    expect(entries).toEqual(["Open", "Open in new tab", "Open as file", "Delete"]);
    await pick(page, "More actions for Tone", "Open");
    expect(onOpen).toHaveBeenCalledWith("skill", { hub: null, id: "tone" });
    await pick(page, "More actions for Tone", "Open in new tab");
    expect(onOpenInNewTab).toHaveBeenCalledWith("skill", { hub: null, id: "tone" });
  });

  it("offers no Open as file when the app can't open a tab", async () => {
    const { host } = itemsHost(nobody);
    const { page } = await showLibrary(host);
    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Tone"]')?.click(),
    );
    const entries = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
    expect(entries).toEqual(["Open", "Open in new tab", "Delete"]);
  });

  it("opens an open page's file from its menu", async () => {
    const openItem = vi.fn();
    const page = render(
      <ToastStoreProvider store={createToastStore()}>
        <SkillPage {...skillPageProps(openItem)} />
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

  it("offers no Open as file on a phone, even where openItem opens the page", async () => {
    const page = render(
      <PresentationProvider presentation="phone">
        <ToastStoreProvider store={createToastStore()}>
          <SkillPage {...skillPageProps(vi.fn())} />
        </ToastStoreProvider>
      </PresentationProvider>,
    );
    await settled();
    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Tone"]')?.click(),
    );
    const entries = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
    expect(entries).toEqual(["Delete"]);
  });

  it("offers no Open as file in the Library's rows on a phone", async () => {
    const { host } = itemsHost(nobody);
    const provided = new Map<unknown, unknown>([
      [LibraryItemsHostService, host],
      [LibraryTabMemoryService, { get: () => undefined, set: vi.fn() }],
    ]);
    const context = {
      services: {
        get: (key: unknown) => provided.get(key),
        find: (key: unknown) => provided.get(key),
      },
      openItem: vi.fn(),
      openItemInNewTab: vi.fn(),
    } as unknown as PlaceViewProps["context"];
    const page = render(
      <PresentationProvider presentation="phone">
        <ToastStoreProvider store={createToastStore()}>
          <LibraryPlace context={context} />
        </ToastStoreProvider>
      </PresentationProvider>,
    );
    await settled();
    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Tone"]')?.click(),
    );
    const entries = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
    expect(entries).toEqual(["Open", "Open in new tab", "Delete"]);
  });
});
