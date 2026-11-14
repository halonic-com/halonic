// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { LibraryItemsHost, LibraryListing } from "../library-items-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryPage, type LibraryPageProps } from "./library-page.tsx";

afterEach(unmountAll);

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

verifies("library.page", () => {
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
    const host = hostWith({ connector: new Error("The workspace folder is gone.") });
    const page = await show(host, { kind: "connector" });
    expect(page.textContent).toContain("Couldn't load connectors");
    expect(page.textContent).toContain("The workspace folder is gone.");
    act(() => button(page, "Try again")?.click());
    await settled();
    expect(host.list).toHaveBeenCalledTimes(2);
  });

  it("opens a row with its tab's kind", async () => {
    const onOpen = vi.fn();
    const page = await show(hostWith({ skill: skills }), { onOpen });
    const cell = [...page.querySelectorAll<HTMLElement>("td")].find((each) =>
      each.textContent?.includes("Acme refunds"),
    );
    act(() => cell?.click());
    expect(onOpen).toHaveBeenCalledWith("skill", "refunds");
  });
});
