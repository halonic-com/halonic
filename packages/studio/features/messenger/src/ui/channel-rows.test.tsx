// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelAdminWords, failureReason } from "../channel-admin-words.ts";
import { Messenger } from "../messenger.ts";
import { button, openDialog, polyfillModals } from "../test-support/modal.ts";
import { byText, openChat, openMessenger, press, settle } from "../test-support/page.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { MembersPanel } from "./members-panel.tsx";
import { MessengerPage } from "./messenger-page.tsx";

beforeEach(polyfillModals);
afterEach(unmountAll);

/** 14:02 on 24 Nov in the test's own time zone, so the clock reads "14:02" wherever it runs. */
const at1402 = new Date(2026, 10, 24, 14, 2);

/** Acme's "Engineering": Chief leads, Elena and Liam are members, Writer is only in the source. */
function engineering(now?: () => Date) {
  const messaging = new FakeAgentMessaging(now === undefined ? {} : { now });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const elena = messaging.addAgent(acme.id, { name: "Elena", activity: "working" });
  const liam = messaging.addAgent(acme.id, { name: "Liam", activity: "working" });
  const writer = messaging.addAgent(acme.id, { name: "Writer" });
  const channel = messaging.addConversation(chief.id, {
    title: "Engineering",
    members: [chief.id, elena.id, liam.id],
  });
  return { messaging, acme, chief, elena, liam, writer, channel };
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

async function typeInBox(box: HTMLTextAreaElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
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
      expect(row?.querySelector("[data-flag]")?.textContent).toBe(", needs you");
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

verifies("messenger.channel-work-actions", () => {
  it("sends the message again to that agent only on Ask again", async () => {
    const { messaging, elena, liam, channel } = engineering();
    const since = "2026-11-24T10:00:00.000Z";
    messaging.addMessage(channel.id, {
      author: { kind: "me" },
      body: "Check the build",
      to: [elena.id, liam.id],
      work: [
        { agent: elena.id, state: "failed", since },
        { agent: liam.id, state: "answered", since },
      ],
    });
    const send = vi.spyOn(messaging, "send");
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    const lines = page.querySelector("[data-work-lines]");
    expect(lines?.textContent).toContain("Elena's task was closed without an answer. · Ask again");
    expect(button("Ask again", lines ?? document)).toBeDefined();
    expect(lines?.querySelectorAll("button")).toHaveLength(1);

    await press(button("Ask again", lines ?? document));
    expect(send).toHaveBeenCalledExactlyOnceWith(channel.id, "Check the build", [], {
      to: [elena.id],
    });
    expect(page.querySelectorAll('main li[data-author="me"]')).toHaveLength(2);
  });

  /** "Check the build" to Elena, whose task closed without an answer; `body` changes the text. */
  function closedForElena(body = "Check the build") {
    const setup = engineering();
    const { messaging, elena, channel } = setup;
    messaging.addMessage(channel.id, {
      author: { kind: "me" },
      body,
      to: [elena.id],
      work: [{ agent: elena.id, state: "failed", since: "2026-11-24T10:00:00.000Z" }],
    });
    return setup;
  }

  it("sends once however often Ask again is pressed while it sends", async () => {
    const { messaging } = closedForElena();
    let finish: () => void = () => undefined;
    const send = vi.spyOn(messaging, "send").mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ outcome: "refused", reason: "offline" });
      }),
    );
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    const lines = page.querySelector("[data-work-lines]");
    await press(button("Ask again", lines ?? document));
    expect(button("Ask again", lines ?? document)?.getAttribute("aria-busy")).toBe("true");
    await press(button("Ask again", lines ?? document));
    expect(send).toHaveBeenCalledOnce();
    await act(async () => finish());
  });

  it("asks each agent again while another agent's send is still running", async () => {
    const { messaging, elena, liam, channel } = engineering();
    const since = "2026-11-24T10:00:00.000Z";
    messaging.addMessage(channel.id, {
      author: { kind: "me" },
      body: "Check the build",
      to: [elena.id, liam.id],
      work: [
        { agent: elena.id, state: "failed", since },
        { agent: liam.id, state: "failed", since },
      ],
    });
    const send = vi.spyOn(messaging, "send").mockReturnValue(new Promise(() => undefined));
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    const asks = () => [
      ...(page.querySelector("[data-work-lines]")?.querySelectorAll("button") ?? []),
    ];
    await press(asks()[0]);
    expect(asks()[1]?.getAttribute("aria-busy")).not.toBe("true");
    await press(asks()[1]);
    expect(send.mock.calls.map((call) => call[3])).toEqual([{ to: [elena.id] }, { to: [liam.id] }]);
  });

  it("sends nothing while the source is offline, and says so after the lines", async () => {
    const { messaging, acme } = closedForElena();
    messaging.goOffline(acme.id);
    const send = vi.spyOn(messaging, "send");
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    await press(button("Ask again", page.querySelector("[data-work-lines]") ?? document));
    expect(send).not.toHaveBeenCalled();
    const alert = page.querySelector('main p[role="alert"]');
    expect(alert?.textContent).toBe("Paperclip · Acme is offline, so nothing was sent.");
    expect(alert?.closest("[data-work-lines]")).toBeNull();
  });

  it("offers no Ask again for a message with no text", async () => {
    const { messaging } = closedForElena("  ");
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    const lines = page.querySelector("[data-work-lines]");
    expect(lines?.textContent).toBe("Elena's task was closed without an answer.");
    expect(lines?.querySelector("button")).toBeNull();
  });

  it("says as of when the source was last read while it is offline", async () => {
    const { messaging, acme, elena, channel } = engineering(() => at1402);
    messaging.addMessage(channel.id, {
      author: { kind: "me" },
      body: "Check the build",
      to: [elena.id],
      work: [{ agent: elena.id, state: "working", since: at1402.toISOString() }],
    });
    messaging.goOffline(acme.id);
    const later = new Date(2026, 10, 24, 15, 30);
    const page = render(<MessengerPage messenger={new Messenger(messaging, () => later)} />);
    await settle();
    await openChat(page, "Engineering");
    expect(page.querySelector("[data-work-lines]")?.textContent).toBe(
      "Elena · working, as of 14:02",
    );
  });
});

verifies("messenger.channel-picker-add", () => {
  it("offers Add Writer for a name that isn't a member, through the history notice", async () => {
    const { messaging, writer, channel } = engineering();
    messaging.addMessage(channel.id, { body: "Plan for today" });
    const setMembers = vi.spyOn(messaging, "setMembers");
    const page = await openMessenger(messaging);
    const box = await openChat(page, "Engineering");
    await typeInBox(box, "@Wri");
    const notMember = page.querySelector("[data-not-member]");
    expect(notMember?.textContent).toBe(
      "Writer isn't in this channel.Add WriterOnly members can be named here.",
    );
    expect(page.querySelector("[data-chat-picker]")).toBeNull();

    await press(button("Add Writer", notMember ?? document));
    expect(openDialog()?.querySelector("[data-history-notice]")?.textContent).toBe(
      "Writer will see all earlier messages in Engineering.",
    );
    expect(setMembers).not.toHaveBeenCalled();

    await press(button("Add Writer", openDialog() ?? document));
    expect(setMembers).toHaveBeenCalledOnce();
    const [after] = await messaging.listConversations();
    expect(after?.members).toContain(writer.id);
  });

  it("moves focus to the box once Writer is added, and reads the note out", async () => {
    const { messaging, channel } = engineering();
    messaging.addMessage(channel.id, { body: "Plan for today" });
    const page = await openMessenger(messaging);
    const box = await openChat(page, "Engineering");
    await typeInBox(box, "@Wri");
    const spoken = [...page.querySelectorAll('main [role="status"] .sr-only')].map(
      (each) => each.textContent,
    );
    expect(spoken).toContain("Writer isn't in this channel. Only members can be named here.");

    await press(button("Add Writer", page.querySelector("[data-not-member]") ?? document));
    await press(button("Add Writer", openDialog() ?? document));
    await settle();
    expect(page.querySelector("[data-not-member]")).toBeNull();
    expect(document.activeElement).toBe(box);
  });

  it("can't add Writer to a channel of 8 agents, and says why", async () => {
    const { messaging, acme, chief, elena, liam } = engineering();
    const others = ["Ana", "Ben", "Cleo", "Dev", "Eli"].map(
      (name) => messaging.addAgent(acme.id, { name }).id,
    );
    messaging.addConversation(chief.id, {
      title: "Everyone",
      members: [chief.id, elena.id, liam.id, ...others],
    });
    const setMembers = vi.spyOn(messaging, "setMembers");
    const page = await openMessenger(messaging);
    const box = await openChat(page, "Everyone");
    await typeInBox(box, "@Wri");
    const notMember = page.querySelector("[data-not-member]");
    const add = button("Add Writer", notMember ?? document);
    expect(add?.getAttribute("aria-disabled")).toBe("true");
    expect(notMember?.textContent).toContain("A channel can have up to 8 agents.");
    await press(add);
    expect(openDialog()).toBeFalsy();
    expect(setMembers).not.toHaveBeenCalled();
  });

  it("takes the note away once the text goes past the name", async () => {
    const { messaging } = engineering();
    const page = await openMessenger(messaging);
    const box = await openChat(page, "Engineering");
    await typeInBox(box, "@Wri");
    expect(page.querySelector("[data-not-member]")).not.toBeNull();
    await typeInBox(box, "@Wri ");
    expect(page.querySelector("[data-not-member]")).toBeNull();
    expect(page.querySelector("[data-chat-picker]")).toBeNull();
  });

  it("says nothing about adding while the name typed is a member's", async () => {
    const { messaging } = engineering();
    const page = await openMessenger(messaging);
    const box = await openChat(page, "Engineering");
    await typeInBox(box, "@Ele");
    expect(page.querySelector("[data-not-member]")).toBeNull();
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
