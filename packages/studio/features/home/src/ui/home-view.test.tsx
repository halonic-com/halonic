// @vitest-environment jsdom
import type { AiChats, ChatSummary } from "@halonicjs/studio-feature-assistant/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { HomeContentPane } from "./home-content-pane.tsx";
import { HomeListColumn } from "./home-list-column.tsx";

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
  root = undefined;
  element = undefined;
});

function summary(id: string, title: string): ChatSummary {
  return {
    id,
    kind: "build",
    title,
    lastUsedAt: "2026-11-26T09:00:00.000Z",
    answering: false,
    itemsToReview: 0,
  };
}

/** Home's chats as the Assistant gives them, with a way to change them as another place would. */
function fakeChats(start: readonly ChatSummary[]) {
  let chats = start;
  const listeners = new Set<() => void>();
  const leaves = new Map<string, () => void>();
  const release = vi.fn();
  const service: AiChats = {
    list: async () => chats,
    subscribe: (_context, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    newChat: vi.fn(async () => "new-chat"),
    open: vi.fn(() => release),
    openInTab: vi.fn(),
    render: (chatId, _context, onLeave) => {
      leaves.set(chatId, onLeave);
      return <p>{`Chat ${chatId}`}</p>;
    },
  };
  const change = async (next: readonly ChatSummary[]) => {
    chats = next;
    await act(async () => {
      for (const listener of listeners) listener();
    });
  };
  /** The chat leaves Home for another place, as the Assistant tells Home. */
  const leave = async (chatId: string) => {
    await act(async () => leaves.get(chatId)?.());
  };
  return { service, change, leave, release };
}

function contextWith(service: AiChats | undefined): WorkspaceContext {
  const services = { get: () => service, find: () => service };
  return { services, announcer: { announce: vi.fn() } } as unknown as WorkspaceContext;
}

/** Both slots, with the open chat held between them as the shell holds it. */
function Home({ context }: { readonly context: WorkspaceContext }) {
  const [open, setOpen] = useState<string | undefined>(undefined);
  const slot = { context, open, setOpen };
  return (
    <>
      <HomeListColumn {...slot} />
      <div data-pane="">
        <HomeContentPane {...slot} sections={<p>Sections</p>} />
      </div>
    </>
  );
}

async function show(context: WorkspaceContext): Promise<HTMLElement> {
  element = document.createElement("div");
  document.body.append(element);
  const shown = element;
  root = createRoot(shown);
  await act(async () => root?.render(<Home context={context} />));
  return shown;
}

function button(page: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((each) => each.textContent?.trim() === name);
}

function rowTitles(page: HTMLElement): string[] {
  return [...page.querySelectorAll("tr")].map((row) => row.textContent?.trim() ?? "");
}

function pane(page: HTMLElement): string | null | undefined {
  return page.querySelector("[data-pane]")?.textContent;
}

function cellOf(page: HTMLElement, title: string): HTMLElement | undefined {
  const row = [...page.querySelectorAll("tr")].find((each) => each.textContent?.includes(title));
  return row?.querySelector<HTMLElement>('[role="gridcell"]') ?? undefined;
}

verifies("home.list-column", () => {
  it("shows New chat first, then the AI chats in the order given", async () => {
    const { service } = fakeChats([summary("digest", "Digest"), summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    const newChat = button(page, "New chat");
    const list = page.querySelector("table, [role='grid']");
    expect(newChat?.compareDocumentPosition(list as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(rowTitles(page)).toEqual([
      expect.stringContaining("Digest"),
      expect.stringContaining("Triage"),
    ]);
  });

  it('says "No chats yet." while there are none', async () => {
    const page = await show(contextWith(fakeChats([]).service));
    expect(page.textContent).toContain("No chats yet.");
  });

  it("opens a new chat in the content pane", async () => {
    const { service } = fakeChats([]);
    const page = await show(contextWith(service));
    await act(async () => button(page, "New chat")?.click());
    expect(service.open).toHaveBeenCalledWith("new-chat", expect.anything());
    expect(pane(page)).toBe("Chat new-chat");
  });

  it("says why a new chat couldn't start", async () => {
    const { service } = fakeChats([]);
    service.newChat = async () => Promise.reject(new Error("The engine isn't answering."));
    const context = contextWith(service);
    const page = await show(context);
    await act(async () => button(page, "New chat")?.click());
    expect(context.announcer.announce).toHaveBeenCalledWith(
      "Couldn't start a chat. The engine isn't answering.",
      "assertive",
    );
  });

  it("leaves the column empty and shows Home's sections without the Assistant", async () => {
    const page = await show(contextWith(undefined));
    expect(button(page, "New chat")).toBeUndefined();
    expect(page.querySelector("nav")).toBeNull();
    expect(pane(page)).toBe("Sections");
  });

  it("shows the open chat's row as the current one", async () => {
    const { service } = fakeChats([summary("digest", "Digest"), summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    await act(async () => cellOf(page, "Triage")?.click());
    const current = [...page.querySelectorAll("[aria-current]")].map(
      (each) => each.closest("tr")?.textContent ?? "",
    );
    expect(current.length).toBeGreaterThan(0);
    expect(current.every((text) => text.includes("Triage"))).toBe(true);
  });

  it("opens a chat as its tab on a Ctrl-click, and keeps the pane as it is", async () => {
    const { service } = fakeChats([summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    await act(async () =>
      cellOf(page, "Triage")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      ),
    );
    expect(service.openInTab).toHaveBeenCalledWith("triage", expect.anything());
    expect(pane(page)).toBe("Sections");
  });

  it("says what failed when the chats can't be read", async () => {
    const { service } = fakeChats([]);
    service.list = async () => Promise.reject(new Error("The engine isn't answering."));
    const context = contextWith(service);
    await show(context);
    expect(context.announcer.announce).toHaveBeenCalledWith(
      "Couldn't load the chats. The engine isn't answering.",
      "assertive",
    );
  });
});

verifies("home.content-pane", () => {
  it("shows Home's sections while no chat is open, and the chat once picked", async () => {
    const { service } = fakeChats([summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    expect(pane(page)).toBe("Sections");
    await act(async () => cellOf(page, "Triage")?.click());
    expect(pane(page)).toBe("Chat triage");
  });

  it("holds the open chat in Home and gives it back when the pane moves on", async () => {
    const { service, change, release } = fakeChats([summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    await act(async () => cellOf(page, "Triage")?.click());
    expect(service.open).toHaveBeenCalledWith("triage", expect.anything());
    expect(release).not.toHaveBeenCalled();
    await change([]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("shows the sections again when the open chat leaves Home for another place", async () => {
    const { service, leave } = fakeChats([summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    await act(async () => cellOf(page, "Triage")?.click());
    await leave("triage");
    expect(pane(page)).toBe("Sections");
  });

  it("shows the sections again when the open chat is deleted", async () => {
    const { service, change } = fakeChats([summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    await act(async () => cellOf(page, "Triage")?.click());
    await change([]);
    expect(pane(page)).toBe("Sections");
  });
});
