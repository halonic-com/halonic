// @vitest-environment jsdom
import type { LibraryItemKind } from "@halonicjs/app";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LibraryItemsHost, LibraryListing } from "../library-items-host.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryPage, type LibraryPageProps } from "./library-page.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restorePopover();
});

const noUsage = { agents: [], hubs: [], routines: [], collections: [] };

const skills: LibraryListing = {
  hubs: [
    {
      id: "acme",
      name: "acme",
      entries: [
        {
          id: "refunds",
          name: "Acme refunds",
          detail: "Use for refund questions",
          usage: { ...noUsage, agents: [{ id: "support", name: "Support", hub: null }] },
        },
      ],
    },
    { id: "beta", name: "beta", entries: [] },
  ],
};

function hostWith(
  listings: Partial<Record<string, LibraryListing | Error>>,
): LibraryItemsHost & { list: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn(async (kind: string) => {
      const listing = listings[kind] ?? { hubs: [] };
      if (listing instanceof Error) {
        throw listing;
      }
      return listing;
    }),
    remove: vi.fn(async () => ({ undo: vi.fn(async () => {}) })),
    readFile: async () => "",
    subscribe: () => () => {},
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function show(
  host: LibraryItemsHost,
  props: Partial<LibraryPageProps> = {},
): Promise<HTMLElement> {
  const page = render(
    <LibraryPage
      host={host}
      kind="skill"
      onKindChange={() => undefined}
      onOpen={() => undefined}
      onOpenInNewTab={() => undefined}
      {...props}
    />,
  );
  await settled();
  return page;
}

function button(page: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((each) => each.textContent?.includes(name));
}

verifies("library.library-page", () => {
  it("shows four tabs, the tab's sentence, its rows with Used by and its New button", async () => {
    const page = await show(hostWith({ skill: skills }), { onNew: () => undefined });
    const tabs = [...page.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);
    // The kit sets each label twice in the tab, one copy hidden to keep the width steady.
    expect(tabs).toEqual([
      "SkillsSkills",
      "KnowledgeKnowledge",
      "CollectionsCollections",
      "ConnectorsConnectors",
    ]);
    expect(page.textContent).toContain(
      "Instructions your agents can pick up when a task calls for them.",
    );
    expect(page.textContent).toContain("Acme refunds");
    expect(page.textContent).toContain("Used by Support");
    expect(page.textContent).toContain("No skills in beta yet.");
    expect(button(page, "New skill")).toBeDefined();
  });

  it("asks the host for the selected tab and gives Knowledge no New button", async () => {
    const host = hostWith({});
    const page = await show(host, { kind: "knowledge", onNew: () => undefined });
    expect(host.list).toHaveBeenCalledWith("knowledge");
    expect(page.textContent).toContain("Documents your agents can search.");
    expect(page.textContent).toContain("No knowledge yet");
    expect(button(page, "New")).toBeUndefined();
  });

  it("reports the selected tab to the app", async () => {
    const onKindChange = vi.fn();
    const page = await show(hostWith({}), { onKindChange });
    const connectors = [...page.querySelectorAll<HTMLElement>('[role="tab"]')][3];
    act(() => connectors?.click());
    expect(onKindChange).toHaveBeenCalledWith("connector");
  });

  it("says what failed, and asks the host again on Try again", async () => {
    const host = hostWith({
      connector: Object.assign(new Error("The workspace folder is gone."), {
        kind: "invalid_input",
      }),
    });
    const page = await show(host, { kind: "connector" });
    expect(page.textContent).toContain("Couldn't load connectors");
    expect(page.textContent).toContain("The workspace folder is gone.");
    act(() => button(page, "Try again")?.click());
    await settled();
    expect(host.list).toHaveBeenCalledTimes(2);
  });

  it("keeps the list when a later read fails, with a line above it and no raw reason", async () => {
    let notify: () => void = () => undefined;
    const host = hostWith({ skill: skills });
    host.subscribe = (read) => {
      notify = read;
      return () => {};
    };
    const page = await show(host);
    host.list.mockRejectedValueOnce(new Error("ECONNRESET at socket.js:41"));
    act(() => notify());
    await settled();
    expect(page.textContent).toContain("Acme refunds");
    expect(page.textContent).toContain("Couldn't load skills.");
    expect(page.textContent).toContain("Showing the list from before.");
    expect(page.textContent).not.toContain("ECONNRESET");
    act(() => button(page, "Try again")?.click());
    await settled();
    expect(page.textContent).not.toContain("Couldn't load skills.");
    expect(page.textContent).toContain("Acme refunds");
  });

  it("holds the only New button in the empty state, with no search field", async () => {
    const onNew = vi.fn();
    const page = await show(hostWith({}), { onNew });
    expect(page.textContent).toContain("No skills yet");
    expect(page.querySelector('input[type="search"]')).toBeNull();
    const news = [...page.querySelectorAll("button")].filter(
      (each) => each.textContent === "New skill",
    );
    expect(news).toHaveLength(1);
    act(() => news[0]?.click());
    expect(onNew).toHaveBeenCalledWith("skill");
  });

  it("opens a row with its tab's kind", async () => {
    const onOpen = vi.fn();
    const page = await show(hostWith({ skill: skills }), { onOpen });
    const cell = [...page.querySelectorAll<HTMLElement>("td")].find((each) =>
      each.textContent?.includes("Acme refunds"),
    );
    act(() => cell?.click());
    expect(onOpen).toHaveBeenCalledWith("skill", { hub: "acme", id: "refunds" });
  });

  it("lists a row's menu in the spec's order and opens from it", async () => {
    const onOpen = vi.fn();
    const onOpenInNewTab = vi.fn();
    const page = await show(hostWith({ skill: skills }), {
      onOpen,
      onOpenInNewTab,
      onOpenAsFile: () => undefined,
    });
    const item = (name: string) =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (each) => each.textContent === name,
      );
    const openMenu = () =>
      act(() =>
        page
          .querySelector<HTMLElement>('button[aria-label="More actions for Acme refunds"]')
          ?.click(),
      );
    openMenu();
    const entries = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
    expect(entries).toEqual(["Open", "Open in new tab", "Open as file", "Delete"]);
    await act(async () => item("Open")?.click());
    expect(onOpen).toHaveBeenCalledWith("skill", { hub: "acme", id: "refunds" });
    openMenu();
    await act(async () => item("Open in new tab")?.click());
    expect(onOpenInNewTab).toHaveBeenCalledWith("skill", { hub: "acme", id: "refunds" });
  });

  it("offers Open the docs folder in the empty Knowledge tab, and only there", async () => {
    const onOpenDocsFolder = vi.fn();
    const knowledge = await show(hostWith({}), { kind: "knowledge", onOpenDocsFolder });
    act(() => button(knowledge, "Open the docs folder")?.click());
    expect(onOpenDocsFolder).toHaveBeenCalledOnce();
    const collections = await show(hostWith({}), { kind: "collection", onOpenDocsFolder });
    expect(button(collections, "Open the docs folder")).toBeUndefined();
    const without = await show(hostWith({}), { kind: "knowledge" });
    expect(button(without, "Open the docs folder")).toBeUndefined();
  });

  it("tells a phone to put knowledge in the docs folder on the computer, with no button", async () => {
    const root = render(
      <PresentationProvider presentation="phone">
        <LibraryPage
          host={hostWith({})}
          kind="knowledge"
          onKindChange={() => undefined}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
          onOpenDocsFolder={() => undefined}
        />
      </PresentationProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(root.textContent).toContain(
      "Put documents in the workspace's docs folder on your computer, then give it to an agent under Tools.",
    );
    expect(button(root, "Open the docs folder")).toBeUndefined();
  });

  it("shows loading, not the previous tab's rows, while a new tab's items are on their way", async () => {
    const host = hostWith({ skill: skills });
    host.list.mockImplementation((kind: string) =>
      kind === "skill" ? Promise.resolve(skills) : new Promise(() => undefined),
    );
    function Switching() {
      const [kind, setKind] = useState<LibraryItemKind>("skill");
      return (
        <LibraryPage
          host={host}
          kind={kind}
          onKindChange={setKind}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
        />
      );
    }
    const page = render(<Switching />);
    await settled();
    expect(page.textContent).toContain("Acme refunds");
    const knowledge = [...page.querySelectorAll<HTMLElement>('[role="tab"]')][1];
    act(() => knowledge?.click());
    expect(page.textContent).not.toContain("Acme refunds");
  });
  it("shows loading, not the old workspace's rows, when the host changes and the new read fails", async () => {
    const first = hostWith({ skill: skills });
    const second = hostWith({ skill: new Error("The workspace folder is gone.") });
    let swap: () => void = () => undefined;
    function Swapping() {
      const [host, setHost] = useState<LibraryItemsHost>(first);
      swap = () => setHost(second);
      return (
        <LibraryPage
          host={host}
          kind="skill"
          onKindChange={() => undefined}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
        />
      );
    }
    const page = render(<Swapping />);
    await settled();
    expect(page.textContent).toContain("Acme refunds");
    act(() => swap());
    expect(page.textContent).not.toContain("Acme refunds");
    await settled();
    expect(page.textContent).not.toContain("Acme refunds");
    expect(page.textContent).not.toContain("Showing the list from before.");
    expect(page.textContent).toContain("Couldn't load skills");
  });
});
