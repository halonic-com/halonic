// @vitest-environment jsdom
import type { LibraryItemKind } from "@halonicjs/app";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { type LibraryItemsHost, LibraryItemsHostService } from "../library-items-host.ts";
import { type LibraryTabMemory, LibraryTabMemoryService } from "../library-tab-memory.ts";
import { requestLibraryTab } from "../library-tab-request.ts";
import { type NewCollectionHost, NewCollectionHostService } from "../new-collection-host.ts";
import { type NewConnectorHost, NewConnectorHostService } from "../new-connector-host.ts";
import { requestNewConnector } from "../new-connector-request.ts";
import { type NewSkillHost, NewSkillHostService } from "../new-skill-host.ts";
import { fakeModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryPlace } from "./library-place.tsx";

afterEach(unmountAll);

const noUsage = { agents: [], hubs: [], routines: [], collections: [] };

function contextOf(
  kept: LibraryItemKind | undefined,
  extra: Partial<WorkspaceContext> = {},
): {
  context: WorkspaceContext;
  memory: LibraryTabMemory & { set: ReturnType<typeof vi.fn> };
  list: ReturnType<typeof vi.fn>;
} {
  const list = vi.fn(async (kind: LibraryItemKind) => ({
    hubs:
      kind === "skill"
        ? [
            {
              id: "acme",
              name: "acme",
              entries: [{ id: "refunds", name: "Acme refunds", usage: noUsage }],
            },
          ]
        : [],
    ...(kind === "skill"
      ? {
          shared: {
            workspaceName: "Acme",
            entries: [{ id: "tone", name: "Tone", usage: noUsage }],
          },
        }
      : {}),
  }));
  const host: LibraryItemsHost = { list, subscribe: () => () => {} };
  const memory = { get: () => kept, set: vi.fn() };
  const provided = new Map<unknown, unknown>([
    [LibraryItemsHostService, host],
    [LibraryTabMemoryService, memory],
  ]);
  const services = {
    get: (key: unknown) => provided.get(key),
    find: (key: unknown) => provided.get(key),
  };
  return {
    context: { services, ...extra } as unknown as WorkspaceContext,
    memory,
    list,
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function show(context: WorkspaceContext): Promise<HTMLElement> {
  const page = render(<LibraryPlace context={context} />);
  await settled();
  return page;
}

function selectedTab(page: HTMLElement): string | null | undefined {
  return page.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
}

verifies("library.library-place", () => {
  it("opens on Skills the first time, with the Library heading", async () => {
    const page = await show(contextOf(undefined).context);
    expect(selectedTab(page)).toContain("Skills");
    expect(page.querySelector("h1")?.textContent).toBe("Library");
  });

  it("opens on the tab the workspace was last on", async () => {
    const { context, list } = contextOf("collection");
    const page = await show(context);
    expect(selectedTab(page)).toContain("Collections");
    expect(list).toHaveBeenCalledWith("collection");
  });

  it("shows the tab a command asked for before the page was drawn", async () => {
    requestLibraryTab("connector");
    const { context, memory } = contextOf("skill");
    const page = await show(context);
    expect(selectedTab(page)).toContain("Connectors");
    expect(memory.set).toHaveBeenCalledWith("connector");
  });

  it("remembers the tab the user selects", async () => {
    const { context, memory } = contextOf(undefined);
    const page = await show(context);
    act(() => [...page.querySelectorAll<HTMLElement>('[role="tab"]')][1]?.click());
    await settled();
    expect(selectedTab(page)).toContain("Knowledge");
    expect(memory.set).toHaveBeenCalledWith("knowledge");
  });

  it("opens a row under its hub, and a shared one under the workspace's name", async () => {
    const openItem = vi.fn();
    const page = await show(contextOf(undefined, { openItem }).context);
    const cell = (text: string) =>
      [...page.querySelectorAll<HTMLElement>("td")].find((each) =>
        each.textContent?.includes(text),
      );
    act(() => cell("Acme refunds")?.click());
    act(() => cell("Tone")?.click());
    expect(openItem).toHaveBeenNthCalledWith(1, { kind: "skill", hub: "acme", id: "refunds" });
    expect(openItem).toHaveBeenNthCalledWith(2, { kind: "skill", hub: "~workspace", id: "tone" });
  });

  it("opens the New skill dialog even when the host fails to prepare", async () => {
    fakeModal();
    const { context } = contextOf(undefined);
    const host: NewSkillHost = {
      prepare: async () => {
        throw new Error("unreadable");
      },
      hubs: () => [],
      folder: () => "library/skills/",
      create: async () => ({ hub: null, id: "x" }),
    };
    const find = context.services.find;
    context.services.find = ((key: unknown) =>
      key === NewSkillHostService ? host : find(key as never)) as typeof find;
    const page = await show(context);
    const button = [...page.querySelectorAll("button")].find((each) =>
      each.textContent?.includes("New"),
    );
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(page.ownerDocument.querySelector("dialog[open]")).not.toBeNull();
  });

  it("opens the New collection dialog on Collections and opens the new collection's page", async () => {
    fakeModal();
    const openItem = vi.fn();
    const { context } = contextOf("collection", { openItem });
    const host: NewCollectionHost = {
      prepare: async () => {},
      file: () => "library/collections/",
      create: async () => ({ hub: null, id: "claims" }),
    };
    const find = context.services.find;
    context.services.find = ((key: unknown) =>
      key === NewCollectionHostService ? host : find(key as never)) as typeof find;
    const page = await show(context);
    const button = [...page.querySelectorAll("button")].find((each) =>
      each.textContent?.includes("New collection"),
    );
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const dialog = page.ownerDocument.querySelector("dialog[open]");
    expect(dialog).not.toBeNull();
    const input = dialog?.querySelector("input") as HTMLInputElement;
    expect(page.ownerDocument.activeElement).toBe(input);
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      set?.call(input, "Claims");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      [...(dialog?.querySelectorAll("button") ?? [])]
        .find((each) => each.textContent?.startsWith("Create"))
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(openItem).toHaveBeenCalledWith({ kind: "collection", hub: "~workspace", id: "claims" });
  });

  it("opens the New connector dialog on Connectors and opens the new connector's page", async () => {
    fakeModal();
    const openItem = vi.fn();
    const { context } = contextOf("connector", { openItem });
    const host: NewConnectorHost = {
      prepare: async () => {},
      hubs: () => [{ id: "acme", name: "acme" }],
      ways: () => ["http"],
      file: () => "hubs/acme/library/connectors/",
      create: async () => ({ hub: "acme", id: "notes" }),
    };
    const find = context.services.find;
    context.services.find = ((key: unknown) =>
      key === NewConnectorHostService ? host : find(key as never)) as typeof find;
    const page = await show(context);
    const button = [...page.querySelectorAll("button")].find((each) =>
      each.textContent?.includes("New connector"),
    );
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const dialog = page.ownerDocument.querySelector("dialog[open]");
    expect(dialog?.textContent).toContain("How it connects");
  });

  it("opens New connector with the name and way a run banner asked for, on the Connectors tab", async () => {
    fakeModal();
    const { context, memory } = contextOf("skill");
    const host: NewConnectorHost = {
      prepare: async () => {},
      hubs: () => [{ id: "acme", name: "acme" }],
      ways: () => ["google", "http"],
      file: () => "hubs/acme/library/connectors/drive.connector.yaml",
      create: async () => ({ hub: "acme", id: "drive" }),
    };
    const find = context.services.find;
    context.services.find = ((key: unknown) =>
      key === NewConnectorHostService ? host : find(key as never)) as typeof find;
    const page = await show(context);
    await act(async () => {
      requestNewConnector({ name: "drive", way: "google" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const dialog = page.ownerDocument.querySelector("dialog[open]");
    expect(memory.set).toHaveBeenCalledWith("connector");
    expect(dialog?.querySelector<HTMLInputElement>("input")?.value).toBe("drive");
    expect(dialog?.querySelector<HTMLInputElement>("input[type=radio]:checked")?.value).toBe(
      "google",
    );
  });
});
