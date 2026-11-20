// @vitest-environment jsdom
import type { LibraryItemKind } from "@halonicjs/app";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
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

const filesApi = vi.hoisted(() => ({ requestFilesReveal: vi.fn(async () => "shown") }));
vi.mock("@halonicjs/studio-feature-files/api", () => filesApi);

afterEach(() => {
  unmountAll();
  filesApi.requestFilesReveal.mockReset();
});

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
  const host: LibraryItemsHost = {
    list,
    remove: async () => ({ undo: async () => {} }),
    readFile: async () => "",
    subscribe: () => () => {},
  };
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

async function show(
  context: WorkspaceContext,
  presentation: "desktop" | "phone" = "desktop",
  sub?: string,
): Promise<HTMLElement> {
  const page = render(
    <PresentationProvider presentation={presentation}>
      <LibraryPlace context={context} {...(sub === undefined ? {} : { sub })} />
    </PresentationProvider>,
  );
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

  it("picks no way when a run banner asks for one the host does not offer", async () => {
    fakeModal();
    const { context } = contextOf("connector");
    const host: NewConnectorHost = {
      prepare: async () => {},
      hubs: () => [{ id: "acme", name: "acme" }],
      ways: () => ["http"],
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
    expect(dialog?.querySelector<HTMLInputElement>("input")?.value).toBe("drive");
    expect(dialog?.querySelector("input[type=radio]:checked")).toBeNull();
    expect(dialog?.textContent).not.toContain("Google");
  });

  it("shows a second request's name while the dialog is open", async () => {
    fakeModal();
    const { context } = contextOf("connector");
    const host: NewConnectorHost = {
      prepare: async () => {},
      hubs: () => [{ id: "acme", name: "acme" }],
      ways: () => ["google", "http"],
      file: () => "hubs/acme/library/connectors/x.connector.yaml",
      create: async () => ({ hub: "acme", id: "x" }),
    };
    const find = context.services.find;
    context.services.find = ((key: unknown) =>
      key === NewConnectorHostService ? host : find(key as never)) as typeof find;
    const page = await show(context);
    for (const name of ["drive", "mail"]) {
      await act(async () => {
        requestNewConnector({ name });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    const dialog = page.ownerDocument.querySelector("dialog[open]");
    expect(dialog?.querySelector<HTMLInputElement>("input")?.value).toBe("mail");
  });

  it("drops a request made while no host can take it, so a host that appears later opens nothing", async () => {
    fakeModal();
    document.querySelectorAll("dialog").forEach((left) => {
      left.remove();
    });
    const { context: withoutHost } = contextOf("connector");
    await show(withoutHost);
    await act(async () => {
      requestNewConnector({ name: "drive" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    unmountAll();
    const { context } = contextOf("connector");
    const host: NewConnectorHost = {
      prepare: async () => {},
      hubs: () => [{ id: "acme", name: "acme" }],
      ways: () => ["http"],
      file: () => "hubs/acme/library/connectors/drive.connector.yaml",
      create: async () => ({ hub: "acme", id: "drive" }),
    };
    const find = context.services.find;
    context.services.find = ((key: unknown) =>
      key === NewConnectorHostService ? host : find(key as never)) as typeof find;
    const page = await show(context);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(page.ownerDocument.querySelector("dialog[open]")).toBeNull();
  });
});

verifies("library.library-phone", () => {
  it("offers no New connector on a phone", async () => {
    const { context } = contextOf("connector");
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
    const page = await show(context, "phone", "connector");
    expect(
      [...page.querySelectorAll("button")].some((each) =>
        each.textContent?.includes("New connector"),
      ),
    ).toBe(false);
  });

  it("shows the Connectors tab, and no dialog, for a request on a phone", async () => {
    const openPlaceList = vi.fn();
    const { context } = contextOf("skill", { openPlaceList });
    const page = await show(context, "phone", "skill");
    await act(async () => {
      requestNewConnector({ name: "notes" });
    });
    await settled();
    // One call: the shell replaces the kind page shown (`replaceSibling`), it doesn't stack on it.
    expect(openPlaceList).toHaveBeenCalledTimes(1);
    expect(openPlaceList).toHaveBeenCalledWith("library", "connector", "Connectors");
    expect(page.ownerDocument.querySelector("dialog[open]")).toBeNull();
  });
});

verifies("library.library-phone-kinds", () => {
  it("lists the four kinds on a phone, and pushes the kind's list from a row", async () => {
    const openPlaceList = vi.fn();
    const { context, memory } = contextOf(undefined, { openPlaceList });
    const page = await show(context, "phone");
    const rows = [...page.querySelectorAll("li button")].map((each) => each.textContent);
    expect(rows).toHaveLength(4);
    // Studio's own ring, drawn inside the flush row, not the browser's outline (a11y check L8).
    for (const row of page.querySelectorAll("li button")) {
      expect(row.className).toContain("focus-ring-inset");
    }
    expect(page.querySelector('[role="tab"]')).toBeNull();
    act(() => (page.querySelectorAll("li button")[1] as HTMLElement).click());
    expect(openPlaceList).toHaveBeenCalledWith("library", "knowledge", "Knowledge");
    expect(memory.set).not.toHaveBeenCalled();
  });

  it("shows how many items each kind has on its row (flow-library 8.1)", async () => {
    const { context } = contextOf(undefined, { openPlaceList: vi.fn() });
    const page = await show(context, "phone");
    const rows = [...page.querySelectorAll("li button")].map((each) => each.textContent);
    expect(rows).toEqual([
      "Skills2 skills›",
      "Knowledge0 sources›",
      "Collections0 collections›",
      "Connectors0 connectors›",
    ]);
    expect(page.textContent).not.toContain("Documents your agents can search.");
  });

  it("shows a kind's items under its own heading, with no tabs, when the page is pushed", async () => {
    const { context, list } = contextOf(undefined);
    const page = await show(context, "phone", "skill");
    expect(list).toHaveBeenCalledWith("skill");
    expect(page.querySelector('[role="tab"]')).toBeNull();
    expect(page.querySelector("h1")?.textContent).toBe("Skills");
    expect(page.textContent).toContain("Tone");
  });

  it("shows a Plugins row only where Settings has a plugins section", async () => {
    const without = await show(contextOf(undefined).context, "phone");
    expect(without.textContent).not.toContain("Plugins");
    unmountAll();
    const openSettings = vi.fn();
    const { context } = contextOf(undefined, {
      openSettings,
      settingsSections: [{ id: "plugins", title: "Plugins" }],
    });
    const page = await show(context, "phone");
    const row = [...page.querySelectorAll("li button")].find((each) =>
      each.textContent?.includes("Plugins"),
    );
    act(() => (row as HTMLElement).click());
    expect(openSettings).toHaveBeenCalledWith("plugins");
  });

  it("shows the kind's page for a tab request made while the list of kinds shows", async () => {
    const openPlaceList = vi.fn();
    const { context } = contextOf(undefined, { openPlaceList });
    await show(context, "phone");
    await act(async () => requestLibraryTab("collection"));
    expect(openPlaceList).toHaveBeenCalledWith("library", "collection", "Collections");
  });
});

verifies("library.open-docs-folder", () => {
  const docsButton = (page: HTMLElement) =>
    Array.from(page.querySelectorAll("button")).find(
      (button) => button.textContent === "Open the docs folder",
    );

  it("shows Files with the workspace's docs folder revealed, writing nothing", async () => {
    const showSidebarView = vi.fn();
    const { context } = contextOf("knowledge", { showSidebarView });
    const page = await show(context);

    act(() => docsButton(page)?.click());

    expect(filesApi.requestFilesReveal).toHaveBeenCalledExactlyOnceWith("docs");
    expect(showSidebarView).toHaveBeenCalledExactlyOnceWith("files");
  });

  /** Clicks the button while the reveal answers `answer`, and returns the toasts shown. */
  async function toastsAfterReveal(answer: "shown" | "nearest") {
    filesApi.requestFilesReveal.mockResolvedValue(answer);
    const toasts = createToastStore();
    const { context } = contextOf("knowledge", { showSidebarView: vi.fn() });
    const page = render(
      <ToastStoreProvider store={toasts}>
        <LibraryPlace context={context} />
      </ToastStoreProvider>,
    );
    await settled();
    await act(async () => docsButton(page)?.click());
    return toasts.list();
  }

  it("says politely, once, that there's no docs folder when Files shows the root instead", async () => {
    expect(await toastsAfterReveal("nearest")).toMatchObject([
      {
        tone: "info",
        title:
          "There's no docs folder in this workspace yet. Make one on your computer, then put documents in it.",
      },
    ]);
  });

  it("shows no toast when the docs folder is there", async () => {
    expect(await toastsAfterReveal("shown")).toEqual([]);
  });

  it("offers no button where the window has no sidebar views to show", async () => {
    const page = await show(contextOf("knowledge").context);
    expect(page.textContent).toContain("docs folder");
    expect(docsButton(page)).toBeUndefined();
  });

  it("offers no button on a phone", async () => {
    const { context } = contextOf("knowledge", { showSidebarView: vi.fn() });
    const page = await show(context, "phone", "knowledge");
    expect(page.textContent).toContain("docs folder");
    expect(docsButton(page)).toBeUndefined();
  });
});
