import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeAgentMessaging } from "./fake-agent-messaging.ts";

/** A fake with two sources whose clock the test moves by hand. */
function makeFake() {
  let now = new Date("2026-11-24T10:00:00.000Z");
  const messaging = new FakeAgentMessaging({ now: () => now });
  const acme = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const globex = messaging.addSource({ label: "Paperclip · Globex", provider: "paperclip" });
  return { messaging, acme, globex, setTime: (iso: string) => (now = new Date(iso)) };
}

verifies("contracts.fake-agent-messaging", () => {
  it("keeps two sources' agents with the same name apart", async () => {
    const { messaging, acme, globex } = makeFake();
    const acmeChief = messaging.addAgent(acme.id, { name: "Chief" });
    const globexChief = messaging.addAgent(globex.id, { name: "Chief" });

    const agents = await messaging.listAgents();

    expect(agents.map((agent) => agent.source)).toEqual([acme.id, globex.id]);
    expect(acmeChief.id).not.toBe(globexChief.id);
  });

  it("answers an open item once and reports one answered elsewhere", async () => {
    const { messaging, acme } = makeFake();
    const first = messaging.addInboxItem(acme.id, { question: "Ship it?" });
    const second = messaging.addInboxItem(acme.id, { question: "Hire Ana?" });

    const answered = await messaging.answer(first.id, { kind: "option", option: "yes" });
    const again = await messaging.answer(first.id, { kind: "option", option: "no" });
    messaging.answerElsewhere(
      second.id,
      { kind: "person", name: "Web page" },
      { kind: "reply", text: "Not yet" },
    );
    const late = await messaging.answer(second.id, { kind: "option", option: "yes" });

    expect(answered.outcome).toBe("answered");
    expect(again).toMatchObject({ outcome: "already-answered", by: { kind: "me" } });
    expect(late).toMatchObject({ outcome: "already-answered", by: { name: "Web page" } });
    expect((await messaging.listInboxItems()).map((item) => item.question)).toEqual([
      "Hire Ana?",
      "Ship it?",
    ]);
  });

  it("sends a message into a conversation, which no longer waits for me", async () => {
    const { messaging, acme } = makeFake();
    const chief = messaging.addAgent(acme.id, { name: "Chief" });
    const chat = messaging.addConversation(chief.id);
    messaging.addMessage(chat.id, { body: "Can I ship?" });
    const waiting = (await messaging.listConversations())[0];

    const sent = await messaging.send(chat.id, "Yes, ship it");
    const messages = await messaging.listMessages(chat.id);

    expect(waiting?.waitingForMe).toBe(true);
    expect(sent).toMatchObject({ outcome: "sent", message: { author: { kind: "me" } } });
    expect(messages.map((message) => message.body)).toEqual(["Can I ship?", "Yes, ship it"]);
    expect((await messaging.listConversations())[0]?.waitingForMe).toBe(false);
    expect(await messaging.send("no-such-chat", "Hi")).toEqual({
      outcome: "refused",
      reason: "not-found",
    });
  });

  it("offline, reads a source as of its last read and refuses writes without queueing them", async () => {
    const { messaging, acme, globex, setTime } = makeFake();
    const chief = messaging.addAgent(acme.id, { name: "Chief" });
    const chat = messaging.addConversation(chief.id);
    const item = messaging.addInboxItem(acme.id, { question: "Ship it?" });

    setTime("2026-11-24T14:05:00.000Z");
    messaging.goOffline(acme.id);
    messaging.addInboxItem(acme.id, { question: "Made while offline?" });
    const sources = await messaging.listSources();
    const answer = await messaging.answer(item.id, { kind: "option", option: "yes" });
    const message = await messaging.send(chat.id, "Still there?");

    expect(sources.find((source) => source.id === acme.id)?.state).toEqual({
      kind: "offline",
      asOf: "2026-11-24T10:00:00.000Z",
    });
    expect(sources.find((source) => source.id === globex.id)?.state.kind).toBe("online");
    expect((await messaging.listInboxItems()).map((each) => each.question)).toEqual(["Ship it?"]);
    expect(answer).toEqual({ outcome: "refused", reason: "offline" });
    expect(message).toEqual({ outcome: "refused", reason: "offline" });

    messaging.goOnline(acme.id);
    expect(await messaging.listMessages(chat.id)).toEqual([]);
    expect((await messaging.listInboxItems()).map((each) => each.state.kind)).toEqual([
      "open",
      "open",
    ]);
  });

  it("refuses writes to a signed-out source", async () => {
    const { messaging, acme } = makeFake();
    const item = messaging.addInboxItem(acme.id, { question: "Ship it?" });
    messaging.signOut(acme.id);

    expect(await messaging.answer(item.id, { kind: "option", option: "yes" })).toEqual({
      outcome: "refused",
      reason: "signed-out",
    });
  });

  it("lists work newest change first and finds text across kinds", async () => {
    const { messaging, acme } = makeFake();
    const owen = messaging.addAgent(acme.id, { name: "Owen", title: "Overview" });
    const old = messaging.addWork(acme.id, {
      label: "ACME-1",
      title: "Old",
      updatedAt: "2026-11-20T09:00:00.000Z",
    });
    messaging.addWork(acme.id, {
      label: "ACME-2",
      title: "Search overview",
      assignee: owen.id,
      state: "blocked",
      blockedBy: [old.id],
      updatedAt: "2026-11-23T09:00:00.000Z",
    });

    const work = await messaging.listWork();
    const hits = await messaging.search("overview");

    expect(work.map((each) => each.label)).toEqual(["ACME-2", "ACME-1"]);
    expect(work[0]?.blockedBy).toEqual([old.id]);
    expect(hits.map((hit) => hit.kind)).toEqual(["agent", "work"]);
  });

  it("tells a reader which source changed", async () => {
    const { messaging, acme } = makeFake();
    const changes = messaging.changes()[Symbol.asyncIterator]();

    messaging.addInboxItem(acme.id, { question: "Ship it?" });

    expect(await changes.next()).toEqual({ done: false, value: acme.id });
    await changes.return?.();
  });
});
