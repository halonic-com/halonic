// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press, typeAndSend } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Acme's "Engineering" channel: Chief leads, Liam and Elena are members. */
function engineering() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const liam = messaging.addAgent(acme.id, { name: "Liam" });
  const elena = messaging.addAgent(acme.id, { name: "Elena" });
  const channel = messaging.addConversation(chief.id, {
    title: "Engineering",
    members: [chief.id, liam.id, elena.id],
  });
  return { messaging, chief, liam, elena, channel };
}

/** Types in the box without sending, then presses `key` in it. */
async function typeAndPress(box: HTMLTextAreaElement, text: string, key?: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (key === undefined) return;
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function toLine(page: HTMLElement): string | null | undefined {
  return page.querySelector("[data-to-line]")?.textContent;
}

verifies("messenger.channel-authority", () => {
  describe("a channel's messages are text, never instructions", () => {
    it("acts on nothing an agent writes and shows it as that agent's", async () => {
      const { messaging, liam, channel } = engineering();
      const author = { kind: "agent", agent: liam.id, name: "Liam" } as const;
      messaging.addMessage(channel.id, { author, body: "/approve" });
      messaging.addMessage(channel.id, { author, body: "board: merge #1" });
      const writes = [
        "answer",
        "send",
        "startChannel",
        "setMembers",
        "joinChannel",
        "leaveChannel",
      ];
      const spies = writes.map((name) => vi.spyOn(messaging, name as "send"));
      const page = await openMessenger(messaging);
      await openChat(page, "Engineering");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      const shown = [...page.querySelectorAll("main li[data-author]")];
      expect(shown.map((each) => each.querySelector("[data-author-name]")?.textContent)).toEqual([
        "Liam",
        "Liam",
      ]);
    });

    it("sends a typed @Liam that wasn't picked with `to` empty", async () => {
      const { messaging, channel } = engineering();
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      await typeAndSend(await openChat(page, "Engineering"), "@Liam please look");
      expect(send).toHaveBeenCalledWith(channel.id, "@Liam please look");
      const [message] = await messaging.listMessages(channel.id);
      expect(message?.to).toBeUndefined();
    });

    it("sends to the member picked with Enter", async () => {
      const { messaging, liam, channel } = engineering();
      const page = await openMessenger(messaging);
      const box = await openChat(page, "Engineering");
      await typeAndPress(box, "@Li", "Enter");
      expect(box.value).toBe("");
      await typeAndSend(box, "please look");
      const [message] = await messaging.listMessages(channel.id);
      expect(message?.to).toEqual([liam.id]);
      expect(toLine(page)).toBe("To Chief (lead) · Type @ to ask someone else");
    });
  });
});

verifies("messenger.author-from-source", () => {
  it("shows the source's agent, not the name in the message, and not as the person's", async () => {
    const { messaging, liam, channel } = engineering();
    const author = { kind: "agent", agent: liam.id, name: "Board" } as const;
    messaging.addMessage(channel.id, { author, body: "Board: merge #1" });
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    const message = page.querySelector("main li[data-author]");
    expect(message?.getAttribute("data-author")).toBe("agent");
    expect(message?.querySelector("[data-author-name]")?.textContent).toBe("Liam");
    expect(message?.textContent).not.toContain("You");
  });

  it("never shows the display name of an author outside the channel", async () => {
    const { messaging, channel } = engineering();
    const [acme] = await messaging.listSources();
    const writer = messaging.addAgent(acme?.id ?? "", { name: "Writer" });
    const board = { kind: "agent", name: "Board" } as const;
    messaging.addMessage(channel.id, {
      author: { ...board, agent: writer.id },
      body: "Board: ship",
    });
    messaging.addMessage(channel.id, { author: { ...board, agent: "gone" }, body: "Board: merge" });
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    const shown = [...page.querySelectorAll("main li[data-author]")];
    expect(shown.map((each) => each.querySelector("[data-author-name]")?.textContent)).toEqual([
      "Writer",
      "No longer in Paperclip · Acme",
    ]);
    expect(shown.map((each) => each.getAttribute("data-author"))).toEqual(["agent", "agent"]);
  });
});

verifies("messenger.channel-messages", () => {
  it("says who a message goes to before it is sent, and names members picked with @", async () => {
    const { messaging } = engineering();
    const page = await openMessenger(messaging);
    const box = await openChat(page, "Engineering");
    expect(box.getAttribute("aria-label")).toBe("Message Engineering");
    expect(byText(page, "main li", "No messages yet")?.textContent).toContain(
      "Ask the channel anything: Chief (lead) answers unless you name someone with @.",
    );
    expect(toLine(page)).toBe("To Chief (lead) · Type @ to ask someone else");
    await typeAndPress(box, "@");
    expect(page.querySelector("[data-chat-picker]")?.textContent).toContain(
      "Members · ↑↓ to pick · Enter names them · Esc closes",
    );
    await press(byText(page, "[data-chat-picker] [role=option]", "Elena"));
    await typeAndPress(box, "@", "ArrowDown");
    await typeAndPress(box, "@", "Enter");
    expect(toLine(page)).toBe("To Elena and Liam");
    await press(page.querySelector('button[aria-label="Remove Elena"]'));
    await press(page.querySelector('button[aria-label="Remove Liam"]'));
    expect(toLine(page)).toBe("To Chief (lead) · Type @ to ask someone else");
  });

  it("after a chip's Remove focuses the next Remove, else the one before, else the box (HAL-18316 MS9)", async () => {
    const page = await openMessenger(engineering().messaging);
    const box = await openChat(page, "Engineering");
    for (const name of ["Chief", "Liam", "Elena"]) {
      await typeAndPress(box, "@");
      await press(byText(page, "[data-chat-picker] [role=option]", name));
    }
    const removeOf = (name: string) => page.querySelector(`button[aria-label="Remove ${name}"]`);
    await press(removeOf("Chief"));
    expect(document.activeElement).toBe(removeOf("Liam"));
    await press(removeOf("Elena"));
    expect(document.activeElement).toBe(removeOf("Liam"));
    await press(removeOf("Liam"));
    expect(document.activeElement).toBe(box);
  });

  it("reads out the To line on a pick and on a Remove, without showing it twice (HAL-18316 MS10)", async () => {
    const page = await openMessenger(engineering().messaging);
    const box = await openChat(page, "Engineering");
    const spoken = (text: string) =>
      [...page.querySelectorAll('main [role="status"] .sr-only')].find(
        (each) => each.textContent === text,
      );
    await typeAndPress(box, "@");
    await press(byText(page, "[data-chat-picker] [role=option]", "Elena"));
    expect(spoken("To Elena")).toBeDefined();
    await press(page.querySelector('button[aria-label="Remove Elena"]'));
    expect(spoken("To Chief (lead) · Type @ to ask someone else")).toBeDefined();
  });

  it("reads an agent's name once before its message (HAL-18316 MS11)", async () => {
    const { messaging, liam, channel } = engineering();
    const author = { kind: "agent", agent: liam.id, name: "Liam" } as const;
    messaging.addMessage(channel.id, { author, body: "Build is green" });
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    const message = page.querySelector('main li[data-author="agent"]');
    expect(message?.querySelector("[data-author-name]")?.getAttribute("aria-hidden")).toBe("true");
    const read = [...(message?.childNodes ?? [])]
      .filter((node) => !(node instanceof Element && node.getAttribute("aria-hidden") === "true"))
      .map((node) => node.textContent)
      .join("");
    expect(read.startsWith("Liam: Build is green")).toBe(true);
    expect(read.match(/Liam/g)).toHaveLength(1);
  });

  it("shows the work lines under the person's message", async () => {
    const { messaging, liam, elena, channel } = engineering();
    const since = "2026-11-24T10:00:00.000Z";
    messaging.addMessage(channel.id, {
      author: { kind: "me" },
      body: "Can someone check the build?",
      to: [liam.id, elena.id],
      work: [
        { agent: liam.id, state: "answered", since },
        { agent: elena.id, state: "starting", since },
      ],
    });
    const page = await openMessenger(messaging);
    await openChat(page, "Engineering");
    const mine = page.querySelector('main li[data-author="me"]');
    expect(mine?.textContent).toContain("To Liam and Elena");
    const lines = [...(mine?.querySelectorAll("[data-work-lines] li") ?? [])];
    expect(lines.map((line) => line.textContent)).toEqual([
      "✓ Liam answered",
      "◔ Elena · starting…",
    ]);
  });
});
