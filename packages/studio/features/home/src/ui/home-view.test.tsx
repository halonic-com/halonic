// @vitest-environment jsdom
import type { AiChats, ChatSummary } from "@halonicjs/studio-feature-assistant/api";
import {
  createToastStore,
  ToastRegion,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { EngineNotAnswering, type WorkspaceContext } from "@halonicjs/studio-shell";
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

/** Shows Home; with `toasts`, inside that store and with its region, as the shell has them. */
async function show(context: WorkspaceContext, toasts?: ToastStore): Promise<HTMLElement> {
  element = document.createElement("div");
  document.body.append(element);
  const shown = element;
  root = createRoot(shown);
  const home =
    toasts === undefined ? (
      <Home context={context} />
    ) : (
      <ToastStoreProvider store={toasts}>
        <Home context={context} />
        <ToastRegion store={toasts} />
      </ToastStoreProvider>
    );
  await act(async () => root?.render(home));
  return shown;
}

function button(page: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((each) => label(each) === name);
}

/** The words a button shows: a button with a busy label keeps the copy not in use, `invisible`. */
function label(element: HTMLElement): string {
  const shown = element.cloneNode(true) as HTMLElement;
  for (const hidden of shown.querySelectorAll(".invisible")) hidden.remove();
  return shown.textContent?.trim() ?? "";
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

  it("shows a toast with the reason when a new chat can't start, and doesn't announce it", async () => {
    const { service } = fakeChats([]);
    service.newChat = async () => Promise.reject(new EngineNotAnswering());
    const context = contextWith(service);
    const page = await show(context, createToastStore());
    await act(async () => button(page, "New chat")?.click());
    const toast = page.querySelector('[role="alert"]');
    expect(toast?.textContent).toContain("Couldn't start a chat.");
    expect(toast?.textContent).toContain("The engine isn't answering.");
    expect(context.announcer.announce).not.toHaveBeenCalled();
  });

  it("shows the generic sentence in the toast, not the text of an error with no kind", async () => {
    const { service } = fakeChats([]);
    service.newChat = async () => Promise.reject(new Error("TypeError at chats.ts:42"));
    const page = await show(contextWith(service), createToastStore());
    await act(async () => button(page, "New chat")?.click());
    const toast = page.querySelector('[role="alert"]');
    expect(toast?.textContent).toContain("Halonic ran into a problem it can't explain yet.");
    expect(toast?.textContent).not.toContain("chats.ts:42");
  });

  it("says why a new chat couldn't start where no toasts are shown", async () => {
    const { service } = fakeChats([]);
    service.newChat = async () => Promise.reject(new EngineNotAnswering());
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
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const context = contextWith(service);
    await show(context);
    expect(context.announcer.announce).toHaveBeenCalledWith(
      "Couldn't load the chats. The engine isn't answering.",
      "assertive",
    );
  });

  it("shows why the chats can't be read, and Try again reads them again", async () => {
    const { service } = fakeChats([summary("triage", "Triage")]);
    const list = service.list;
    const failing = vi.fn(async () => Promise.reject(new EngineNotAnswering()));
    service.list = failing;
    const page = await show(contextWith(service));
    expect(page.textContent).toContain("Couldn't load the chats. The engine isn't answering.");
    let answer = (_chats: readonly ChatSummary[]) => {};
    const reading = vi.fn(
      () => new Promise<readonly ChatSummary[]>((resolve) => (answer = resolve)),
    );
    service.list = reading;
    const tryAgain = button(page, "Try again");
    await act(async () => {
      tryAgain?.focus();
      tryAgain?.click();
    });
    expect(failing).toHaveBeenCalledOnce();
    expect(reading).toHaveBeenCalledOnce();
    expect(tryAgain?.getAttribute("aria-busy")).toBe("true");
    await act(async () => answer(await list(contextWith(service))));
    expect(rowTitles(page)).toEqual([expect.stringContaining("Triage")]);
    expect(page.textContent).not.toContain("Couldn't load the chats.");
    expect(button(page, "Try again")).toBeUndefined();
    expect(document.activeElement).toBe(button(page, "New chat"));
  });

  it('says "Trying again…" on Try again while its read runs, as the Library does', async () => {
    const { service } = fakeChats([summary("triage", "Triage")]);
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    let fail = (_error: Error) => {};
    service.list = () => new Promise((_resolve, reject) => (fail = reject));
    const tryAgain = button(page, "Try again");
    await act(async () => tryAgain?.click());
    expect(tryAgain?.getAttribute("aria-busy")).toBe("true");
    expect(label(tryAgain as HTMLElement)).toBe("Trying again…");
    await act(async () => fail(new EngineNotAnswering()));
    expect(button(page, "Try again")).toBe(tryAgain);
    expect(label(tryAgain as HTMLElement)).toBe("Try again");
  });

  it("leaves the focus where it is when a list change clears a failure", async () => {
    const { service, change } = fakeChats([summary("triage", "Triage")]);
    const list = service.list;
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    expect(document.activeElement).toBe(document.body);
    service.list = list;
    await change([summary("triage", "Triage")]);
    expect(rowTitles(page)).toEqual([expect.stringContaining("Triage")]);
    expect(document.activeElement).toBe(document.body);
  });

  it("keeps the focus on Try again when its read fails again", async () => {
    const { service } = fakeChats([]);
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    const tryAgain = button(page, "Try again");
    await act(async () => {
      tryAgain?.focus();
      tryAgain?.click();
    });
    expect(page.textContent).toContain("Couldn't load the chats. The engine isn't answering.");
    expect(button(page, "Try again")).toBe(tryAgain);
    expect(tryAgain?.hasAttribute("aria-busy")).toBe(false);
    expect(document.activeElement).toBe(tryAgain);
  });

  it("doesn't move the focus when a Try again click that didn't focus it fails again", async () => {
    // WebKit, which the desktop app uses on macOS, doesn't focus a button on click.
    const { service } = fakeChats([]);
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    await act(async () => button(page, "Try again")?.click());
    expect(button(page, "Try again")).toBeDefined();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves the focus elsewhere when it moved away during a slow Try again", async () => {
    const { service } = fakeChats([summary("triage", "Triage")]);
    const list = service.list;
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    let answer = (_chats: readonly ChatSummary[]) => {};
    service.list = () => new Promise((resolve) => (answer = resolve));
    const promptBox = document.createElement("textarea");
    page.append(promptBox);
    await act(async () => {
      button(page, "Try again")?.focus();
      button(page, "Try again")?.click();
    });
    promptBox.focus();
    await act(async () => answer(await list(contextWith(service))));
    expect(rowTitles(page)).toEqual([expect.stringContaining("Triage")]);
    expect(document.activeElement).toBe(promptBox);
  });

  it("moves the focus to New chat when a list change clears the line from a focused Try again", async () => {
    const { service, change } = fakeChats([summary("triage", "Triage")]);
    const list = service.list;
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    act(() => button(page, "Try again")?.focus());
    service.list = list;
    await change([summary("triage", "Triage")]);
    expect(button(page, "Try again")).toBeUndefined();
    expect(document.activeElement).toBe(button(page, "New chat"));
  });

  it("moves the focus to New chat when a list change clears the line after a failed Try again", async () => {
    const { service, change } = fakeChats([summary("triage", "Triage")]);
    const list = service.list;
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    const tryAgain = button(page, "Try again");
    await act(async () => {
      tryAgain?.focus();
      tryAgain?.click();
    });
    expect(document.activeElement).toBe(tryAgain);
    service.list = list;
    await change([summary("triage", "Triage")]);
    expect(button(page, "Try again")).toBeUndefined();
    expect(document.activeElement).toBe(button(page, "New chat"));
  });

  it("counts a Try again once: a later failure cleared from the page leaves the focus there", async () => {
    const { service, change } = fakeChats([summary("triage", "Triage")]);
    const list = service.list;
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    service.list = list;
    await act(async () => {
      button(page, "Try again")?.focus();
      button(page, "Try again")?.click();
    });
    expect(document.activeElement).toBe(button(page, "New chat"));
    act(() => button(page, "New chat")?.blur());
    service.list = async () => Promise.reject(new EngineNotAnswering());
    await change([]);
    expect(button(page, "Try again")).toBeDefined();
    service.list = list;
    await change([summary("triage", "Triage")]);
    expect(button(page, "Try again")).toBeUndefined();
    expect(document.activeElement).toBe(document.body);
  });

  it("shows the failure line right under New chat", async () => {
    const { service } = fakeChats([]);
    service.list = async () => Promise.reject(new EngineNotAnswering());
    const page = await show(contextWith(service));
    const line = button(page, "New chat")?.nextElementSibling;
    expect(line?.textContent).toContain("Couldn't load the chats. The engine isn't answering.");
    expect(line?.contains(button(page, "Try again") ?? null)).toBe(true);
    // Try again sits under the sentence, its label in line with the sentence's first letter.
    expect(line?.classList.contains("flex-col")).toBe(true);
    expect(line?.classList.contains("items-start")).toBe(true);
    expect(button(page, "Try again")?.parentElement?.classList.contains("-ml-3")).toBe(true);
  });

  it("shows the generic sentence on the line, not the text of an error with no kind", async () => {
    const { service } = fakeChats([]);
    service.list = async () => Promise.reject(new Error("TypeError at chats.ts:42"));
    const page = await show(contextWith(service));
    expect(page.textContent).toContain(
      "Couldn't load the chats. Halonic ran into a problem it can't explain yet.",
    );
    expect(page.textContent).not.toContain("chats.ts:42");
  });

  it("keeps the list it showed under the failure line when a later read fails", async () => {
    const { service, change } = fakeChats([summary("triage", "Triage")]);
    const page = await show(contextWith(service));
    service.list = async () => Promise.reject(new EngineNotAnswering());
    await change([]);
    const line = [...page.querySelectorAll("p")].find((each) =>
      each.textContent?.includes("Couldn't load the chats. The engine isn't answering."),
    );
    const list = page.querySelector("table, [role='grid']");
    expect(line?.compareDocumentPosition(list as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(rowTitles(page)).toEqual([expect.stringContaining("Triage")]);
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
