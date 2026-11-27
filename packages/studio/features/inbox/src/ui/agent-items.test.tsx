// @vitest-environment jsdom

import type { AgentMessaging, MessagingId } from "@halonicjs/ports";
import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { settleHoldMs } from "@halonicjs/studio-kit/settle";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const asked = new Date(2026, 10, 24, 10, 0);
const threeHoursLater = new Date(2026, 10, 24, 13, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Fake timers that still run on their own, so a test can skip an ended row's hold. */
function holdSkippable(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
}

/** Skips the hold of a row that ended (`inbox.final-state`), so it has gone. */
async function afterTheHold(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(settleHoldMs);
  });
  await settled();
}

/** A fake with the source "Paperclip · Acme" and one open question from Chief, asked at 10:00. */
function acme(question = "Ship the **release** today?") {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const item = messaging.addInboxItem(source.id, {
    question,
    from: { kind: "agent", agent: chief.id, name: "Chief" },
  });
  return { messaging, source, item };
}

/** The Inbox with no runs waiting and the agents' items from `messaging`, three hours after the question. */
async function openInbox(messaging: AgentMessaging, openExternal = vi.fn(async () => {})) {
  const inbox = new Inbox(fakeRuns([]).runs);
  const root = render(
    <OpenExternalProvider openExternal={openExternal}>
      <InboxView inbox={inbox} now={() => threeHoursLater} agentMessaging={messaging} />
    </OpenExternalProvider>,
  );
  await settled();
  return root;
}

function rows(root: HTMLElement): HTMLTableRowElement[] {
  return [...root.querySelectorAll<HTMLTableRowElement>('[role="grid"] tr')];
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
  });
  await settled();
}

async function openFirstRow(root: HTMLElement) {
  const cell = rows(root)[0]?.querySelector<HTMLElement>('[role="gridcell"]');
  if (cell === null || cell === undefined) throw new Error("no row");
  await click(cell);
}

/** The fake, with changes that never come, so only an answer's own outcome tells the card. */
function withoutChanges(fake: FakeAgentMessaging): AgentMessaging {
  const quiet: AgentMessaging = Object.create(fake);
  quiet.changes = () => ({
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise<IteratorResult<MessagingId>>(() => {}),
    }),
  });
  return quiet;
}

verifies("inbox.agent-inbox-items", () => {
  describe("the list", () => {
    it("lists an open item with how long it has waited, and its header names its source", async () => {
      const { messaging } = acme();
      const root = await openInbox(messaging);
      const [row] = rows(root);
      expect(row?.textContent).toContain("Ship the release today?");
      // A no-break space joins the number and its unit (inbox.waiting-time).
      expect(row?.querySelector('[data-part="wait-time"]')?.textContent).toBe("Waiting 3\u00a0h");
      expect(root.textContent).toContain("1 waiting");
      await openFirstRow(root);
      const header = root.querySelector('[data-pane="item"] header h2 + p');
      expect(header?.textContent).toBe("Paperclip · Acme · Chief · Waiting 3\u00a0h");
    });

    it("reads again when a source changes, with no polling of its own", async () => {
      const { messaging, source } = acme();
      const root = await openInbox(messaging);
      await act(async () => {
        messaging.addInboxItem(source.id, { question: "Merge the fix?" });
      });
      await settled();
      expect(rows(root).map((row) => row.textContent)).toEqual([
        expect.stringContaining("Merge the fix?"),
        expect.stringContaining("Ship the release today?"),
      ]);
    });

    it("says when a read fails, and reads again on Try again", async () => {
      const { messaging } = acme();
      const listInboxItems = vi
        .spyOn(messaging, "listInboxItems")
        .mockRejectedValueOnce(new Error("engine gone"));
      const root = await openInbox(messaging);
      expect(root.textContent).toContain("Couldn't load the items from your agents.");
      await click(button(root, "Try again"));
      expect(listInboxItems).toHaveBeenCalledTimes(2);
      expect(rows(root)).toHaveLength(1);
    });
  });

  describe("answering", () => {
    it("answers through AgentMessaging.answer and says so on the card", async () => {
      holdSkippable();
      const { messaging, item } = acme();
      const answer = vi.spyOn(messaging, "answer");
      const root = await openInbox(messaging);
      await openFirstRow(root);
      expect(root.querySelector("section h2")?.textContent).toBe("Ship the release today?");
      expect(root.textContent).toContain("Paperclip · Acme · Waiting since 10:00 (3 h)");
      await click(button(root, "Yes"));
      expect(answer).toHaveBeenCalledWith(item.id, { kind: "option", option: "yes" });
      expect(root.textContent).toContain("Answered at 10:00: Yes.");
      await afterTheHold();
      expect(rows(root)).toHaveLength(0);
    });

    it("shows an item answered in another client as answered elsewhere, by whom and how", async () => {
      const { messaging, item } = acme();
      const root = await openInbox(withoutChanges(messaging));
      await openFirstRow(root);
      messaging.answerElsewhere(
        item.id,
        { kind: "person", name: "Liam" },
        { kind: "option", option: "no" },
      );
      await click(button(root, "Yes"));
      // Read again, it shows its final state, with how under it (`inbox.final-state-open`).
      expect(root.textContent).toContain("Answered by Liam · 10:00No");
      expect(() => button(root, "Yes")).toThrow();
    });

    it("turns an open card answered elsewhere as soon as the source says so", async () => {
      const { messaging, item } = acme();
      const root = await openInbox(messaging);
      await openFirstRow(root);
      await act(async () => {
        messaging.answerElsewhere(item.id, { kind: "me" }, { kind: "reply", text: "Tomorrow" });
      });
      await settled();
      expect(root.textContent).toContain("Answered by you · 10:00“Tomorrow”");
    });

    it("says an answer failed and sends it again on Try again", async () => {
      const { messaging } = acme();
      vi.spyOn(messaging, "answer").mockRejectedValueOnce(new Error("engine gone"));
      const root = await openInbox(messaging);
      await openFirstRow(root);
      await click(button(root, "Yes"));
      expect(root.textContent).toContain("Couldn't record your decision.");
      await click(button(root, "Try again"));
      expect(root.textContent).toContain("Answered at 10:00: Yes.");
    });

    it("takes a written answer for a question with no options", async () => {
      const { messaging, source } = acme();
      messaging.addInboxItem(source.id, { question: "What should the title be?", options: [] });
      const answer = vi.spyOn(messaging, "answer");
      const root = await openInbox(messaging);
      await openFirstRow(root);
      const field = root.querySelector("textarea") as HTMLTextAreaElement;
      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        setValue?.call(field, "Halonic 0.3");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await click(button(root, "Send answer"));
      expect(answer).toHaveBeenCalledWith(expect.any(String), {
        kind: "reply",
        text: "Halonic 0.3",
      });
      expect(root.textContent).toContain("Answered at 10:00: “Halonic 0.3”.");
    });
  });

  describe("a source that can't take answers", () => {
    it("shows an offline source as of when, with its answer buttons off", async () => {
      const { messaging, source, item } = acme();
      const answer = vi.spyOn(messaging, "answer");
      const root = await openInbox(messaging);
      await openFirstRow(root);
      await act(async () => messaging.goOffline(source.id));
      await settled();
      expect(root.textContent).toContain("Paperclip · Acme · Offline, as of 10:00");
      const yes = button(root, "Yes");
      expect(yes.getAttribute("aria-disabled")).toBe("true");
      await click(yes);
      expect(answer).not.toHaveBeenCalled();
      expect((await messaging.listInboxItems()).find((each) => each.id === item.id)?.state).toEqual(
        {
          kind: "open",
        },
      );
    });

    it("asks to sign in again once a source's sign-in ended", async () => {
      const { messaging, source } = acme();
      const root = await openInbox(messaging);
      await openFirstRow(root);
      await act(async () => messaging.signOut(source.id));
      await settled();
      expect(root.textContent).toContain("Paperclip · Acme · Sign in again to send your answer.");
      expect(button(root, "No").getAttribute("aria-disabled")).toBe("true");
    });
  });

  describe("agent-written Markdown", () => {
    it("loads no image a question holds, and shows its HTML as text", async () => {
      const fetch = vi.spyOn(globalThis, "fetch");
      const { messaging } = acme(
        'Approve? <img src="https://evil.test/x"> ![x](https://evil.test/y)',
      );
      const root = await openInbox(messaging);
      await openFirstRow(root);
      expect(root.querySelector("img, [src], [srcset]")).toBeNull();
      expect(root.innerHTML).not.toContain("<img");
      expect(root.textContent).toContain('<img src="https://evil.test/x">');
      expect(fetch).not.toHaveBeenCalled();
    });

    it("opens a web link outside the app, and keeps a javascript: link as text", async () => {
      const openExternal = vi.fn(async () => {});
      const { messaging } = acme(
        "Read [the plan](https://acme.example/plan) or [this](javascript:alert(1)).\n\n<script>alert(1)</script>",
      );
      const root = await openInbox(messaging, openExternal);
      await openFirstRow(root);
      const links = [...root.querySelectorAll("a")];
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://acme.example/plan"]);
      expect(root.querySelector("script")).toBeNull();
      expect(root.textContent).toContain("[this](javascript:alert(1))");
      await click(links[0] as HTMLAnchorElement);
      expect(openExternal).toHaveBeenCalledWith("https://acme.example/plan");
    });
  });
});

verifies("inbox.every-waiting-item", () => {
  it("lists a card from a task that isn't a chat after one change, names its task, and answers it", async () => {
    holdSkippable();
    const messaging = new FakeAgentMessaging({ now: () => asked });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    const task = messaging.addWork(source.id, { label: "ACME-12", title: "Fix the login" });
    const root = await openInbox(messaging);
    expect(rows(root)).toHaveLength(0);
    const reads = vi.spyOn(messaging, "listInboxItems");
    let card: ReturnType<FakeAgentMessaging["addInboxItem"]> | undefined;
    await act(async () => {
      card = messaging.addInboxItem(source.id, { question: "Approve the plan?", work: task.id });
    });
    await settled();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(rows(root).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Approve the plan?"),
    ]);
    await openFirstRow(root);
    expect(root.querySelector("section")?.textContent).toContain("From ACME-12 · Fix the login");
    await click(button(root, "Yes"));
    const [answered] = await messaging.listInboxItems();
    expect(answered?.id).toBe(card?.id);
    expect(answered?.state).toMatchObject({ kind: "answered", answer: { option: "yes" } });
    await afterTheHold();
    expect(rows(root)).toHaveLength(0);
  });
});
