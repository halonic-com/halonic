// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelAdminWords, failureReason } from "../channel-admin-words.ts";
import { Messenger } from "../messenger.ts";
import { button, polyfillModals } from "../test-support/modal.ts";
import { byText, openChat, openMessenger, press } from "../test-support/page.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { MembersPanel } from "./members-panel.tsx";

beforeEach(polyfillModals);
afterEach(unmountAll);

/** Acme's "Engineering": Chief leads, Elena and Liam are members and both working. */
function engineering() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const elena = messaging.addAgent(acme.id, { name: "Elena", activity: "working" });
  const liam = messaging.addAgent(acme.id, { name: "Liam", activity: "working" });
  const channel = messaging.addConversation(chief.id, {
    title: "Engineering",
    members: [chief.id, elena.id, liam.id],
  });
  return { messaging, acme, chief, elena, liam, channel };
}

/** Elena asked "Which hostname?", then Liam "Which port?", both under one of the person's messages. */
function withQuestions() {
  const setup = engineering();
  const { messaging, acme, elena, liam, channel } = setup;
  const since = "2026-11-24T10:00:00.000Z";
  messaging.addMessage(channel.id, {
    author: { kind: "me" },
    body: "Can you two set up the server?",
    to: [elena.id, liam.id],
    work: [
      { agent: elena.id, state: "asks-you", work: "w1", since },
      { agent: liam.id, state: "asks-you", work: "w2", since },
    ],
  });
  const asked = (agent: typeof elena, question: string, work: string, createdAt: string) =>
    messaging.addInboxItem(acme.id, {
      question,
      work,
      createdAt,
      from: { kind: "agent", agent: agent.id, name: agent.name },
    });
  asked(elena, "Which hostname?", "w1", "2026-11-24T10:01:00.000Z");
  asked(liam, "Which port?", "w2", "2026-11-24T10:02:00.000Z");
  return setup;
}

function rowOf(page: HTMLElement, title: string): Element | undefined {
  return byText(page, "nav li button", title);
}

verifies("messenger.channel-waiting", () => {
  describe("a channel's row and what waits for the person", () => {
    it("shows the channel's size and who is working", async () => {
      const { messaging } = engineering();
      const page = await openMessenger(messaging);
      const row = rowOf(page, "Engineering");
      expect(row?.textContent).toContain("Engineering · 3 agents");
      expect(row?.textContent).toContain("2 working · Elena, Liam");
      expect(row?.textContent).not.toContain("Paperclip · Acme");
    });

    it("names the one member working, and nothing once none is", async () => {
      const messaging = new FakeAgentMessaging();
      const acme = messaging.addSource({ label: "Paperclip · Acme" });
      const chief = messaging.addAgent(acme.id, { name: "Chief" });
      const elena = messaging.addAgent(acme.id, { name: "Elena", activity: "working" });
      messaging.addConversation(chief.id, { title: "Engineering", members: [chief.id, elena.id] });
      messaging.addConversation(chief.id, { title: "Design", members: [chief.id] });
      const page = await openMessenger(messaging);
      expect(rowOf(page, "Engineering")?.textContent).toContain("1 working · Elena");
      expect(rowOf(page, "Design")?.textContent).not.toContain("working");
    });

    it("marks the channel with the violet dot while a question waits for the person", async () => {
      const { messaging } = withQuestions();
      const page = await openMessenger(messaging);
      const row = rowOf(page, "Engineering");
      expect(row?.querySelector("[data-needs-you]")?.textContent).toBe(", needs you");
      expect(row?.textContent).not.toContain("asks you");
    });

    it("shows the bar, moves to the next card, and says where the card was asked", async () => {
      const { messaging } = withQuestions();
      const page = await openMessenger(messaging);
      await openChat(page, "Engineering");
      const bar = page.querySelector("[data-waiting-bar]");
      expect(bar?.querySelector("button[aria-haspopup]")?.textContent).toBe("2 waiting for you ▾");
      expect(bar?.textContent?.endsWith(" · Next")).toBe(true);
      const cards = [...page.querySelectorAll("[data-chat-card]")];
      expect(cards.map((card) => card.querySelector("p[role=status]")?.textContent)).toEqual([
        "Also in your Inbox, asked in Engineering. Answering here answers it there.",
        "Also in your Inbox, asked in Engineering. Answering here answers it there.",
      ]);
      await press(button("Next", bar ?? document));
      expect(cards[0]?.contains(document.activeElement)).toBe(true);
      await press(button("Next", bar ?? document));
      expect(cards[1]?.contains(document.activeElement)).toBe(true);
      await press(button("Liam asks you: Which port?"));
      expect(cards[1]?.contains(document.activeElement)).toBe(true);
    });

    it("shows no bar while nothing waits", async () => {
      const { messaging } = engineering();
      const page = await openMessenger(messaging);
      await openChat(page, "Engineering");
      expect(page.querySelector("[data-waiting-bar]")).toBeNull();
    });
  });
});

verifies("messenger.channel-source-gone", () => {
  it("names no blank source when a change to a channel whose source is gone fails", async () => {
    const { messaging } = engineering();
    vi.spyOn(messaging, "setMembers").mockRejectedValue(new Error("no route"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const messenger = new Messenger(messaging);
    const [row] = await messenger.rows();
    if (row === undefined) throw new Error("no channel");
    const gone = { ...row, source: undefined };
    const page = render(
      <MembersPanel
        messenger={messenger}
        row={gone}
        onChanged={() => undefined}
        announce={() => undefined}
      />,
    );
    await press(button("Make lead", page));
    expect(page.querySelector('[role="alert"]')?.textContent).toBe(
      "Couldn't change the members: the channel's connection is gone.",
    );
    expect(page.textContent).not.toContain("in all of .");
  });

  it("says the connection is gone, or the channel is, in every failure line", () => {
    const leave = channelAdminWords.leave.failed;
    expect(leave("Engineering", failureReason(undefined, undefined))).toBe(
      "Couldn't leave Engineering: the channel's connection is gone.",
    );
    const offline = { outcome: "refused", reason: "offline" } as const;
    expect(leave("Engineering", failureReason(offline, undefined))).toBe(
      "Couldn't leave Engineering: the channel's connection is gone.",
    );
    const gone = { outcome: "refused", reason: "not-found" } as const;
    expect(leave("Engineering", failureReason(gone, undefined))).toBe(
      "Couldn't leave Engineering: the channel is gone.",
    );
  });
});
