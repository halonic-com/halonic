// @vitest-environment jsdom

import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { fakeSetups, setupEntry } from "../fake-setups.test-helper.ts";
import { Inbox, type InboxRuns } from "../inbox.ts";
import { StoredReadMarks } from "../read-marks.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

// jsdom has no popovers; the header's ··· menu opens and closes one.
beforeEach(() => {
  HTMLElement.prototype.showPopover = () => undefined;
  HTMLElement.prototype.hidePopover = () => undefined;
});

afterEach(() => {
  unmountAll();
  Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
});

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const now = () => new Date(2026, 10, 8, 10, 43);

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});
const invoice = waitingRun("r2", {
  approvals: [pendingApproval("call-2", "billing__send_invoice", at(10, 40))],
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openInbox(inbox: Inbox, messaging?: FakeAgentMessaging) {
  const root = render(<InboxView inbox={inbox} now={now} agentMessaging={messaging} />);
  await settled();
  return root;
}

function inboxOf(runs: InboxRuns, marks = new StoredReadMarks(null)): Inbox {
  const inbox = new Inbox(runs, now);
  inbox.readMarks = marks;
  return inbox;
}

function cell(root: HTMLElement, title: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>('[role="grid"] [role="gridcell"]')].find(
    (each) => each.textContent?.includes(title),
  );
  if (found === undefined) throw new Error(`no row "${title}"`);
  return found;
}

const isUnread = (root: HTMLElement, title: string) =>
  cell(root, title).querySelector("[data-unread]") !== null;

/** The Needs you heading as a screen reader hears it: "Needs you, 2 waiting, 1 new". */
function heading(root: HTMLElement): string {
  const id = root.querySelector('[role="grid"]')?.getAttribute("aria-labelledby") ?? "";
  const label = document.getElementById(id)?.cloneNode(true) as Element | undefined;
  for (const hidden of label?.querySelectorAll('[aria-hidden="true"]') ?? []) hidden.remove();
  return label?.textContent ?? "";
}

async function press(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error("nothing to press");
  await act(async () => element.click());
  await settled();
}

/** Picks **Mark as unread** in the open item's ··· header menu. */
async function markUnread(root: HTMLElement) {
  const header = root.querySelector('[data-pane="item"] header');
  await press(header?.querySelector('button[aria-label^="More actions for"]'));
  const entry = [...document.querySelectorAll("[role=menuitem]")].find(
    (each) => each.textContent === "Mark as unread",
  );
  await press(entry);
}

verifies("inbox.read-marks", () => {
  it("says each item nobody opened is new, and opening one marks it read but keeps it", async () => {
    const root = await openInbox(inboxOf(fakeRuns([notes, invoice]).runs));
    expect(isUnread(root, "create_note")).toBe(true);
    expect(isUnread(root, "send_invoice")).toBe(true);
    expect(cell(root, "create_note").textContent).toMatch(/new$/);
    expect(heading(root)).toBe("Needs you, 2 waiting, 2 new");

    await press(cell(root, "create_note"));
    expect(isUnread(root, "create_note")).toBe(false);
    expect(isUnread(root, "send_invoice")).toBe(true);
    expect(heading(root)).toBe("Needs you, 2 waiting, 1 new");
  });

  it("marks the open item unread from the header's menu, closes it and focuses its row", async () => {
    const root = await openInbox(inboxOf(fakeRuns([notes, invoice]).runs));
    await press(cell(root, "create_note"));
    await markUnread(root);
    expect(root.querySelector('[data-pane="item"] header')).toBeNull();
    expect(document.activeElement).toBe(cell(root, "create_note"));
    expect(isUnread(root, "create_note")).toBe(true);
    expect(heading(root)).toBe("Needs you, 2 waiting, 2 new");
  });

  it("names the header's menu for the item", async () => {
    const root = await openInbox(inboxOf(fakeRuns([notes]).runs));
    await press(cell(root, "create_note"));
    const more = root.querySelector('[data-pane="item"] header button[aria-label^="More actions"]');
    expect(more?.getAttribute("aria-label")).toBe(
      "More actions for sorter wants to use create_note (notes-mcp)",
    );
  });

  it("keeps a bundle new while any card is, and opening it marks each card read", async () => {
    const messaging = new FakeAgentMessaging({ now });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    const chief = messaging.addAgent(source.id, { name: "Chief" });
    const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
    const ship = messaging.addInboxItem(source.id, { question: "Ship 0.2 today?", from });
    const move = messaging.addInboxItem(source.id, { question: "Move the board meeting?", from });
    const marks = new StoredReadMarks(null);
    marks.markRead([`agent:${ship.id}`]);
    const root = await openInbox(inboxOf(fakeRuns([]).runs, marks), messaging);
    expect(isUnread(root, "2 cards from Chief")).toBe(true);
    expect(heading(root)).toBe("Needs you, 2 waiting, 1 new");

    await press(cell(root, "2 cards from Chief"));
    expect(marks.isRead(`agent:${move.id}`)).toBe(true);
    expect(isUnread(root, "2 cards from Chief")).toBe(false);
  });

  it("keeps an opened item read the next time the Inbox opens", async () => {
    const kept = new Map<string, string>();
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
    };
    const first = await openInbox(inboxOf(fakeRuns([notes]).runs, new StoredReadMarks(storage)));
    await press(cell(first, "create_note"));
    unmountAll();

    const again = await openInbox(inboxOf(fakeRuns([notes]).runs, new StoredReadMarks(storage)));
    expect(isUnread(again, "create_note")).toBe(false);
    expect(heading(again)).toBe("Needs you, 1 waiting");
  });

  it("says a step is new again when the run comes back to it", async () => {
    const step = waitingRun("r3", { waitingFor: { title: "Approve this reply?", body: "" } });
    const marks = new StoredReadMarks(null);
    const first = await openInbox(inboxOf(fakeRuns([step]).runs, marks));
    await press(cell(first, "Approve this reply?"));
    unmountAll();

    const back = { ...step, lastWaitingAt: "2026-11-10T11:30:00.000Z" };
    const again = await openInbox(inboxOf(fakeRuns([back]).runs, marks));
    expect(isUnread(again, "Approve this reply?")).toBe(true);
    expect(heading(again)).toBe("Needs you, 1 waiting, 1 new");
  });

  it("marks a bundle's card that still waits unread, not one answered while it was open", async () => {
    const messaging = new FakeAgentMessaging({ now });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    const chief = messaging.addAgent(source.id, { name: "Chief" });
    const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
    const ship = messaging.addInboxItem(source.id, { question: "Ship 0.2 today?", from });
    const move = messaging.addInboxItem(source.id, { question: "Move the board meeting?", from });
    const marks = new StoredReadMarks(null);
    const root = await openInbox(inboxOf(fakeRuns([]).runs, marks), messaging);
    await press(cell(root, "2 cards from Chief"));
    await act(async () => {
      await messaging.answer(move.id, { kind: "reply", text: "Yes, Friday." });
    });
    await settled();

    await markUnread(root);
    expect(marks.isRead(`agent:${ship.id}`)).toBe(false);
    expect(marks.isRead(`agent:${move.id}`)).toBe(true);
    expect(heading(root)).toBe("Needs you, 1 waiting, 1 new");
  });

  it("keeps the dot on a fixed setup item nobody opened, which no longer waits", async () => {
    const inbox = inboxOf(fakeRuns([notes]).runs);
    const fixed = setupEntry("acct-1", at(9, 0), { fixed: true, title: "Google is set up" });
    inbox.addSetupSource(fakeSetups("google", [fixed]).source);
    const root = await openInbox(inbox);
    expect(isUnread(root, "Google is set up")).toBe(true);
    expect(cell(root, "Google is set up").textContent).toMatch(/new/);
    expect(heading(root)).toBe("Needs you, 1 waiting, 1 new");
  });
});
