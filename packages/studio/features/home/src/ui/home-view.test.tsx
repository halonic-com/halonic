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
  const service: AiChats = {
    list: async () => chats,
    subscribe: (_context, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    newChat: vi.fn(async () => "new-chat"),
    open: vi.fn(),
    render: (chatId) => <p>{`Chat ${chatId}`}</p>,
  };
  const change = async (next: readonly ChatSummary[]) => {
    chats = next;
    await act(async () => {
      for (const listener of listeners) listener();
    });
  };
  return { service, change };
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
      <main>
        <HomeContentPane {...slot} sections={<p>Sections</p>} />
      </main>
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

verifies("home.list-column", () => {
  it("shows New chat first, then the AI chats in the order given", async () => {
    const { service } = fakeChats([summary("digest", "Digest"), summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    expect(button(page, "New chat")).toBeDefined();
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
    expect(page.querySelector("main")?.textContent).toBe("Chat new-chat");
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
    expect(page.querySelector("main")?.textContent).toBe("Sections");
  });
});

verifies("home.content-pane", () => {
  it("shows Home's sections while no chat is open, and the chat once picked", async () => {
    const { service } = fakeChats([summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    expect(page.querySelector("main")?.textContent).toBe("Sections");
    const row = page.querySelector<HTMLElement>('tr [role="gridcell"]');
    await act(async () => row?.click());
    expect(page.querySelector("main")?.textContent).toBe("Chat triage");
  });

  it("shows the sections again when the open chat is deleted", async () => {
    const { service, change } = fakeChats([summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    await act(async () => page.querySelector<HTMLElement>('tr [role="gridcell"]')?.click());
    await change([]);
    expect(page.querySelector("main")?.textContent).toBe("Sections");
  });
});
