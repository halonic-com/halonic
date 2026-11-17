// @vitest-environment jsdom
import type { ItemUsage } from "@halonicjs/app";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { type ItemViewProps, limitedLookup, type PlaceViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { libraryFeature } from "../feature.ts";
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
    readFile: async () => "name: Tone\n",
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

function skillPageProps(
  openItem: () => void,
  readFile?: LibraryItemsHost["readFile"],
): ItemViewProps {
  const { host: base } = itemsHost(nobody);
  const host = readFile === undefined ? base : { ...base, readFile };
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
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => provided.get(key),
        find: (key: unknown) => provided.get(key),
      }),
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

  it("shows an open page's file as text in a sheet with Back on a phone", async () => {
    const openItem = vi.fn();
    const page = render(
      <PresentationProvider presentation="phone">
        <ToastStoreProvider store={createToastStore()}>
          <SkillPage {...skillPageProps(openItem)} />
        </ToastStoreProvider>
      </PresentationProvider>,
    );
    await settled();
    await pick(page, "More actions for Tone", "Open as file");
    expect(openItem).not.toHaveBeenCalled();
    expect(document.querySelector("aside h2")?.textContent).toBe("SKILL.md");
    expect(document.querySelector("pre")?.textContent).toBe("name: Tone\n");
    expect(document.querySelector("pre")?.className).toContain("whitespace-pre-wrap");
    act(() => document.querySelector<HTMLElement>('button[aria-label="Back"]')?.click());
    expect(document.querySelector("pre")).toBeNull();
  });

  it("says it couldn't load the file, and Try again reads it again", async () => {
    const readFile = vi
      .fn<LibraryItemsHost["readFile"]>()
      .mockRejectedValueOnce(
        Object.assign(new Error("The skill tone isn't in this workspace any more."), {
          kind: "not_found",
        }),
      )
      .mockResolvedValue("name: Tone\n");
    const page = render(
      <PresentationProvider presentation="phone">
        <ToastStoreProvider store={createToastStore()}>
          <SkillPage {...skillPageProps(vi.fn(), readFile)} />
        </ToastStoreProvider>
      </PresentationProvider>,
    );
    await settled();
    await pick(page, "More actions for Tone", "Open as file");
    expect(document.body.textContent).toContain("Couldn't load the skill");
    expect(document.body.textContent).toContain("The skill tone isn't in this workspace any more.");
    const retry = [...document.querySelectorAll<HTMLElement>("button")].find(
      (each) => each.textContent === "Try again",
    );
    await act(async () => retry?.click());
    await settled();
    expect(document.querySelector("pre")?.textContent).toBe("name: Tone\n");
  });

  it("shows a file that isn't valid YAML as text", async () => {
    const page = render(
      <PresentationProvider presentation="phone">
        <ToastStoreProvider store={createToastStore()}>
          <SkillPage {...skillPageProps(vi.fn(), async () => "name: [unclosed\n")} />
        </ToastStoreProvider>
      </PresentationProvider>,
    );
    await settled();
    await pick(page, "More actions for Tone", "Open as file");
    expect(document.querySelector("pre")?.textContent).toBe("name: [unclosed\n");
  });

  it("offers Open as file in a phone's skill rows, which show it in a sheet", async () => {
    const { host } = itemsHost(nobody);
    const provided = new Map<unknown, unknown>([
      [LibraryItemsHostService, host],
      [LibraryTabMemoryService, { get: () => undefined, set: vi.fn() }],
    ]);
    const context = {
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => provided.get(key),
        find: (key: unknown) => provided.get(key),
      }),
      openItem: vi.fn(),
      openItemInNewTab: vi.fn(),
    } as unknown as PlaceViewProps["context"];
    const page = render(
      <PresentationProvider presentation="phone">
        <ToastStoreProvider store={createToastStore()}>
          <LibraryPlace context={context} sub="skill" />
        </ToastStoreProvider>
      </PresentationProvider>,
    );
    await settled();
    await pick(page, "More actions for Tone", "Open as file");
    expect(document.querySelector("aside h2")?.textContent).toBe("SKILL.md");
    expect(document.querySelector("pre")?.textContent).toBe("name: Tone\n");
    expect(context.openItem).not.toHaveBeenCalled();
  });
});
