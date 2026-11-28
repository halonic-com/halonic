// @vitest-environment jsdom

import { NarrowProvider, type Presentation, PresentationProvider } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});
const review = waitingRun("r2", {
  lastWaitingAt: at(9, 0),
  waitingFor: { title: "Approve this reply?", body: "" },
});

/**
 * The Inbox as the shell sets it up for a window of that size: 640 × 400 is a 1280 × 800 laptop at
 * 200 % zoom, narrow but not a phone; 390 × 844 is a phone, which is narrow too.
 */
const windows: Record<string, { presentation: Presentation; narrow: boolean }> = {
  "640 × 400": { presentation: "desktop", narrow: true },
  "1280 × 800": { presentation: "desktop", narrow: false },
  "390 × 844": { presentation: "phone", narrow: true },
};

/** Two cards from Chief, from the source "Paperclip · Acme", which make one row. */
function cardsFromChief(): FakeAgentMessaging {
  const messaging = new FakeAgentMessaging({ now: () => new Date(2026, 10, 8, 10, 0) });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
  messaging.addInboxItem(source.id, { question: "Ship the release today?", from });
  messaging.addInboxItem(source.id, { question: "Merge the fix?", from });
  return messaging;
}

async function openInbox(size: keyof typeof windows, agentMessaging?: FakeAgentMessaging) {
  const { presentation, narrow } = windows[size] ?? { presentation: "desktop", narrow: false };
  const root = render(
    <PresentationProvider presentation={presentation}>
      <NarrowProvider narrow={narrow}>
        <InboxView
          inbox={new Inbox(fakeRuns([notes, review]).runs)}
          now={() => new Date(2026, 10, 8, 10, 43)}
          agentMessaging={agentMessaging}
        />
      </NarrowProvider>
    </PresentationProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

const pane = (root: HTMLElement, name: "list" | "item") =>
  root.querySelector(`[data-pane="${name}"]`) as HTMLElement;
const hidden = (root: HTMLElement, name: "list" | "item") =>
  pane(root, name).classList.contains("hidden");
const rowCell = (root: HTMLElement, index: number) =>
  root.querySelectorAll<HTMLElement>('[role="grid"] tr [role="gridcell"]')[index] as HTMLElement;
const backToInbox = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('button[aria-label="Back to Inbox"]') ?? undefined;

async function click(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    target.click();
  });
}

verifies("inbox.narrow-window", () => {
  it("shows one pane at a time at 640 × 400, and Back to Inbox returns to the row", async () => {
    const root = await openInbox("640 × 400");
    expect(hidden(root, "list")).toBe(false);
    expect(hidden(root, "item")).toBe(true);
    expect(pane(root, "list").classList.contains("w-full")).toBe(true);
    // A narrow window has no phone top bar, so the list keeps its visible heading.
    expect(root.querySelector("h1")?.parentElement?.classList.contains("sr-only")).toBe(false);

    await click(rowCell(root, 1));
    expect(root.querySelector("section h2")?.textContent).toBe("Approve this reply?");
    expect(hidden(root, "list")).toBe(true);
    expect(hidden(root, "item")).toBe(false);
    expect(pane(root, "item").classList.contains("flex-1")).toBe(true);
    expect(root.querySelector(".max-w-95")).toBeNull();
    const back = backToInbox(root);
    expect(back).toBeDefined();

    await click(back as HTMLElement);
    expect(root.querySelector("section h2")).toBeNull();
    expect(hidden(root, "list")).toBe(false);
    expect(hidden(root, "item")).toBe(true);
    expect(document.activeElement).toBe(rowCell(root, 1));
  });

  it("keeps both panes side by side at 1280 × 800, with no Back to Inbox", async () => {
    const root = await openInbox("1280 × 800");
    expect(pane(root, "list").classList.contains("max-w-95")).toBe(true);
    expect(hidden(root, "item")).toBe(false);
    await click(rowCell(root, 1));
    expect(hidden(root, "list")).toBe(false);
    expect(hidden(root, "item")).toBe(false);
    expect(backToInbox(root)).toBeUndefined();
  });

  it("keeps the phone's layout at 390 × 844, its heading for screen readers only", async () => {
    const root = await openInbox("390 × 844");
    expect(root.querySelector("h1")?.parentElement?.classList.contains("sr-only")).toBe(true);
    expect(hidden(root, "item")).toBe(true);
    await click(rowCell(root, 0));
    expect(hidden(root, "list")).toBe(true);
    await click(backToInbox(root) as HTMLElement);
    expect(document.activeElement).toBe(rowCell(root, 0));
  });

  it("opens an agent's cards from the keyboard at 640 × 400, and Back to Inbox returns to the row", async () => {
    const root = await openInbox("640 × 400", cardsFromChief());
    const row = rowCell(root, 2);
    expect(row.closest("tr")?.textContent).toContain("Chief");
    act(() => row.focus());
    act(() => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(hidden(root, "list")).toBe(true);
    expect(hidden(root, "item")).toBe(false);
    const titles = [...pane(root, "item").querySelectorAll("section h2")];
    expect(titles).toHaveLength(2);
    expect(document.activeElement).toBe(titles[0]);
    const back = backToInbox(root);
    expect(back).toBeDefined();

    await click(back as HTMLElement);
    expect(pane(root, "item").querySelector("section h2")).toBeNull();
    expect(hidden(root, "list")).toBe(false);
    expect(hidden(root, "item")).toBe(true);
    expect(document.activeElement).toBe(rowCell(root, 2));
  });
});
