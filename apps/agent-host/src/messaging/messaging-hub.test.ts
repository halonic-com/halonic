import type { MessagingId } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type MessagingFailure, MessagingHub } from "./messaging-hub.ts";

/** Two fakes, A and B, on one clock the test moves, joined by a hub that records what it reports. */
function twoSources() {
  let now = new Date("2026-11-24T10:00:00.000Z");
  const clock = () => now;
  const a = new FakeAgentMessaging({ now: clock, idPrefix: "a" });
  const b = new FakeAgentMessaging({ now: clock, idPrefix: "b" });
  const sourceA = a.addSource({ label: "Paperclip · Acme" });
  const sourceB = b.addSource({ label: "Paperclip · Globex" });
  const failures: MessagingFailure[] = [];
  const hub = new MessagingHub({
    providers: [
      { name: "acme", messaging: a },
      { name: "globex", messaging: b },
    ],
    report: (failure) => failures.push(failure),
  });
  const at = (time: string) => {
    now = new Date(`2026-11-24T${time}:00.000Z`);
  };
  return { a, b, sourceA, sourceB, hub, failures, at };
}

/** Lets every promise that is already settled run its callbacks; no time passes. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Reads `changes` into a list until the test stops it. */
function collect(changes: AsyncIterable<MessagingId>) {
  const seen: MessagingId[] = [];
  const iterator = changes[Symbol.asyncIterator]();
  const reading = (async () => {
    for (let next = await iterator.next(); next.done !== true; next = await iterator.next()) {
      seen.push(next.value);
    }
  })();
  const stop = async () => {
    await iterator.return?.();
    await reading;
  };
  return { seen, stop };
}

verifies("agent-host.messaging-hub", () => {
  describe("lists", () => {
    it("merges both providers' inbox items, conversations and work, newest first", async () => {
      const { a, b, sourceA, sourceB, hub, at } = twoSources();
      at("10:00");
      const oldest = a.addInboxItem(sourceA.id, { question: "Ship it?" });
      a.addWork(sourceA.id, { label: "HAL-1", title: "Old work" });
      at("10:01");
      const middle = b.addInboxItem(sourceB.id, { question: "Hire Ana?" });
      b.addWork(sourceB.id, { label: "HAL-1", title: "New work" });
      at("10:02");
      const newest = a.addInboxItem(sourceA.id, { question: "Pay the bill?" });
      const chief = b.addAgent(sourceB.id, { name: "Chief" });
      const chat = b.addConversation(chief.id);
      const ravi = a.addAgent(sourceA.id, { name: "Ravi" });
      at("09:00");
      a.addConversation(ravi.id);

      const inbox = await hub.listInboxItems();
      const conversations = await hub.listConversations();
      const work = await hub.listWork();

      expect(inbox.map((item) => item.id)).toEqual([newest.id, middle.id, oldest.id]);
      expect(conversations.map((each) => each.title)).toEqual(["Chief", "Ravi"]);
      expect(conversations[0]?.id).toBe(chat.id);
      expect(work.map((each) => each.title)).toEqual(["New work", "Old work"]);
      expect((await hub.listSources()).map((source) => source.id)).toEqual([
        sourceA.id,
        sourceB.id,
      ]);
      expect((await hub.listAgents()).map((agent) => agent.name)).toEqual(["Ravi", "Chief"]);
    });

    it("gives a conversation's messages oldest first, from the provider that has it", async () => {
      const { b, sourceB, hub, at } = twoSources();
      const chief = b.addAgent(sourceB.id, { name: "Chief" });
      const chat = b.addConversation(chief.id);
      at("10:01");
      b.addMessage(chat.id, { body: "First" });
      at("10:02");
      b.addMessage(chat.id, { body: "Second" });

      const messages = await hub.listMessages(chat.id);

      expect(messages.map((message) => message.body)).toEqual(["First", "Second"]);
      expect(await hub.listMessages("nobody-listed-this")).toEqual([]);
    });

    it("merges both providers' search hits", async () => {
      const { a, b, sourceA, sourceB, hub } = twoSources();
      a.addInboxItem(sourceA.id, { question: "Ship the release?" });
      b.addWork(sourceB.id, { label: "HAL-2", title: "Release notes" });

      const hits = await hub.search("release");

      expect(hits.map((hit) => [hit.kind, hit.source])).toEqual([
        ["inbox-item", sourceA.id],
        ["work", sourceB.id],
      ]);
    });
  });

  describe("writes", () => {
    it("sends an answer to B's item only to B", async () => {
      const { a, b, sourceB, hub } = twoSources();
      const item = b.addInboxItem(sourceB.id, { question: "Hire Ana?" });
      const answerA = vi.spyOn(a, "answer");
      await hub.listInboxItems();

      const result = await hub.answer(item.id, { kind: "option", option: "yes" });

      expect(result.outcome).toBe("answered");
      expect(answerA).not.toHaveBeenCalled();
      const [answered] = await b.listInboxItems();
      expect(answered?.state.kind).toBe("answered");
    });

    it("finds the owner of an item it hasn't listed yet, as just after the host started", async () => {
      const { b, sourceB, hub } = twoSources();
      const chief = b.addAgent(sourceB.id, { name: "Chief" });
      const chat = b.addConversation(chief.id);

      const result = await hub.send(chat.id, "Hello");

      expect(result.outcome).toBe("sent");
    });

    it("passes who a message is addressed to on to the provider that has the conversation", async () => {
      const { b, sourceB, hub } = twoSources();
      const chief = b.addAgent(sourceB.id, { name: "Chief" });
      const chat = b.addConversation(chief.id);

      const result = await hub.send(chat.id, "Hello", [], { to: [chief.id] });

      expect(result).toMatchObject({ outcome: "sent", message: { to: [chief.id] } });
    });

    it("lists no channel to browse and refuses every channel write, asking no provider", async () => {
      const { a, b, sourceA, hub } = twoSources();
      const chief = a.addAgent(sourceA.id, { name: "Chief" });
      const liam = a.addAgent(sourceA.id, { name: "Liam" });
      const calls = [a, b].flatMap((each) => [
        vi.spyOn(each, "startChannel"),
        vi.spyOn(each, "browseChannels"),
      ]);

      const results = [
        await hub.startChannel("Launch", [chief.id, liam.id], chief.id),
        await hub.setMembers("c-1", [chief.id, liam.id], chief.id),
        await hub.joinChannel("c-1"),
        await hub.leaveChannel("c-1"),
      ];

      expect(await hub.browseChannels()).toEqual([]);
      for (const result of results) expect(result).toMatchObject({ reason: "not-supported" });
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    });

    it("refuses an ID no provider listed with not-found, and sends it to no provider", async () => {
      const { a, b, hub } = twoSources();
      const calls = [
        vi.spyOn(a, "answer"),
        vi.spyOn(b, "answer"),
        vi.spyOn(a, "send"),
        vi.spyOn(b, "send"),
      ];

      const answered = await hub.answer("c-1", { kind: "reply", text: "Yes" });
      const sent = await hub.send("c-2", "Hello");

      expect(answered).toEqual({ outcome: "refused", reason: "not-found" });
      expect(sent).toEqual({ outcome: "refused", reason: "not-found" });
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    });
  });

  describe("a provider that fails", () => {
    it("still gives B's items when A throws, and reports A's failure", async () => {
      const { a, b, sourceB, hub, failures } = twoSources();
      const item = b.addInboxItem(sourceB.id, { question: "Hire Ana?" });
      const down = new Error("Acme is down");
      vi.spyOn(a, "listInboxItems").mockRejectedValue(down);

      const inbox = await hub.listInboxItems();

      expect(inbox.map((each) => each.id)).toEqual([item.id]);
      expect(failures).toEqual([{ provider: "acme", action: "listInboxItems", error: down }]);
    });

    it("keeps routing to a provider whose later read failed", async () => {
      const { a, sourceA, hub } = twoSources();
      const item = a.addInboxItem(sourceA.id, { question: "Ship it?" });
      await hub.listInboxItems();
      vi.spyOn(a, "listInboxItems").mockRejectedValue(new Error("Acme is down"));
      await hub.listInboxItems();

      const result = await hub.answer(item.id, { kind: "option", option: "yes" });

      expect(result.outcome).toBe("answered");
    });

    it("fails the read when every provider fails it", async () => {
      const { a, b, hub, failures } = twoSources();
      vi.spyOn(a, "listWork").mockRejectedValue(new Error("Acme is down"));
      vi.spyOn(b, "listWork").mockRejectedValue(new Error("Globex is down"));

      await expect(hub.listWork()).rejects.toThrow("Every messaging provider failed listWork.");
      expect(failures.map((failure) => failure.provider)).toEqual(["acme", "globex"]);
    });
  });

  describe("changes", () => {
    it("merges both providers' changes and stops theirs when the reader stops", async () => {
      const { a, b, sourceA, sourceB, hub } = twoSources();
      const reader = collect(hub.changes());

      a.addInboxItem(sourceA.id, { question: "Ship it?" });
      b.addInboxItem(sourceB.id, { question: "Hire Ana?" });
      await settle();
      await reader.stop();
      a.addInboxItem(sourceA.id, { question: "Pay the bill?" });

      expect(reader.seen).toEqual([sourceA.id, sourceB.id]);
    });

    it("reports a provider whose changes fail, and goes on with the others'", async () => {
      const { a, b, sourceB, hub, failures } = twoSources();
      const broken = new Error("stream broke");
      vi.spyOn(a, "changes").mockReturnValue({
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(broken) }),
      });
      const reader = collect(hub.changes());

      b.addInboxItem(sourceB.id, { question: "Hire Ana?" });
      await settle();
      await reader.stop();

      expect(reader.seen).toEqual([sourceB.id]);
      expect(failures).toEqual([{ provider: "acme", action: "changes", error: broken }]);
    });
  });
});

const screenshot = {
  name: "login.png",
  type: "image/png",
  bytes: new Uint8Array([137, 80, 78, 71]),
};

verifies("agent-host.messaging-hub-attachments", () => {
  it("reads a message's file only from the provider that listed it", async () => {
    const { a, b, sourceB, hub } = twoSources();
    const chief = b.addAgent(sourceB.id, { name: "Chief" });
    const chat = b.addConversation(chief.id);
    b.addMessage(chat.id, { body: "Here", attachments: [screenshot] });
    const readA = vi.spyOn(a, "readAttachment");
    const [message] = await hub.listMessages(chat.id);
    const file = message?.attachments[0];

    const read = await hub.readAttachment(file?.id ?? "");

    expect(read).toEqual({ outcome: "read", bytes: screenshot.bytes, type: "image/png" });
    expect(readA).not.toHaveBeenCalled();
  });

  it("finds an inbox item's file it hasn't listed yet", async () => {
    const { a, sourceA, hub } = twoSources();
    const item = a.addInboxItem(sourceA.id, { question: "Looks right?", files: [screenshot] });

    const read = await hub.readAttachment(item.attachments[0]?.id ?? "");

    expect(read.outcome).toBe("read");
  });

  it("refuses a file no provider listed with not-found, and asks no provider", async () => {
    const { a, b, hub } = twoSources();
    const calls = [vi.spyOn(a, "readAttachment"), vi.spyOn(b, "readAttachment")];

    const read = await hub.readAttachment("nobody-listed-this");

    expect(read).toEqual({ outcome: "refused", reason: "not-found" });
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it("sends files only to the provider that listed the conversation, and can read them back", async () => {
    const { a, b, sourceB, hub } = twoSources();
    const chief = b.addAgent(sourceB.id, { name: "Chief" });
    const chat = b.addConversation(chief.id);
    const sendA = vi.spyOn(a, "send");

    const sent = await hub.send(chat.id, "See this", [screenshot]);
    const file = sent.outcome === "sent" ? sent.message.attachments[0] : undefined;

    expect(file?.name).toBe("login.png");
    expect(sendA).not.toHaveBeenCalled();
    expect((await hub.readAttachment(file?.id ?? "")).outcome).toBe("read");
  });
});

verifies("ports.agent-messaging-avatars", () => {
  it("reads an agent's picture only from the provider that listed the agent, even before a list", async () => {
    const { a, b, sourceB, hub } = twoSources();
    const ada = b.addAgent(sourceB.id, { name: "Ada", picture: screenshot });
    const readA = vi.spyOn(a, "readAttachment");

    const read = await hub.readAttachment(ada.avatar ?? "");

    expect(read).toEqual({ outcome: "read", bytes: screenshot.bytes, type: "image/png" });
    expect(readA).not.toHaveBeenCalled();
    expect((await hub.listAgents()).find((agent) => agent.id === ada.id)?.avatar).toBe(ada.avatar);
  });
});
