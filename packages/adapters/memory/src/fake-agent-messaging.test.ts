// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

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

  it("makes IDs that never collide with another fake's when each has its own prefix", () => {
    const first = new FakeAgentMessaging({ idPrefix: "first" });
    const second = new FakeAgentMessaging({ idPrefix: "second" });

    const ids = [first.addSource({ label: "A" }).id, second.addSource({ label: "B" }).id];

    expect(ids).toEqual(["first-1", "second-1"]);
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

  it("keeps each item's project, so a list can be kept to one project", async () => {
    const { messaging, acme } = makeFake();
    const website = { id: "project-website", name: "Website" };
    messaging.addInboxItem(acme.id, { question: "Ship the page?", project: website });
    messaging.addInboxItem(acme.id, {
      question: "Raise the price?",
      project: { id: "project-billing", name: "Billing" },
    });
    messaging.addInboxItem(acme.id, { question: "Hire Ana?" });

    const items = await messaging.listInboxItems();
    const inWebsite = items.filter((item) => item.project?.id === website.id);

    expect(inWebsite.map((item) => item.question)).toEqual(["Ship the page?"]);
    expect(items.find((item) => item.question === "Hire Ana?")?.project).toBeUndefined();
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

  it("lists an item's and a message's files without their bytes, and gives the bytes on a read", async () => {
    const { messaging, acme } = makeFake();
    const screenshot = { name: "login.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]) };
    const item = messaging.addInboxItem(acme.id, { question: "Ship it?", files: [screenshot] });
    const chief = messaging.addAgent(acme.id, { name: "Chief" });
    const chat = messaging.addConversation(chief.id);
    const message = messaging.addMessage(chat.id, {
      body: "See the log",
      attachments: [screenshot],
    });

    const [listed] = await messaging.listInboxItems();
    const [attachment] = listed?.attachments ?? [];
    const read = await messaging.readAttachment(attachment?.id ?? "");

    expect(listed?.id).toBe(item.id);
    expect(attachment).toEqual({
      id: attachment?.id,
      name: "login.png",
      type: "image/png",
      size: 3,
    });
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0]?.id).not.toBe(attachment?.id);
    expect(read).toEqual({ outcome: "read", bytes: new Uint8Array([1, 2, 3]), type: "image/png" });
    expect(await messaging.readAttachment("no-such-file")).toEqual({
      outcome: "refused",
      reason: "not-found",
    });
    messaging.goOffline(acme.id);
    expect(await messaging.readAttachment(attachment?.id ?? "")).toEqual({
      outcome: "refused",
      reason: "offline",
    });
  });

  it("sends a message with files the engine takes, and refuses one it won't, whole", async () => {
    const messaging = new FakeAgentMessaging({
      attachmentLimit: 4,
      attachmentTypes: ["image/png"],
    });
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const chat = messaging.addConversation(messaging.addAgent(acme.id, { name: "Chief" }).id);
    const png = { name: "a.png", type: "image/png", bytes: new Uint8Array([7, 8]) };

    const sent = await messaging.send(chat.id, "Here", [png]);
    const big = await messaging.send(chat.id, "Big", [{ ...png, bytes: new Uint8Array(5) }]);
    const pdf = await messaging.send(chat.id, "Doc", [png, { ...png, type: "application/pdf" }]);

    const file = sent.outcome === "sent" ? sent.message.attachments[0] : undefined;
    expect(file).toMatchObject({ name: "a.png", type: "image/png", size: 2 });
    expect(await messaging.readAttachment(file?.id ?? "")).toMatchObject({ outcome: "read" });
    expect(big).toEqual({ outcome: "refused", reason: "too-large" });
    expect(pdf).toEqual({ outcome: "refused", reason: "unsupported-type" });
    expect((await messaging.listMessages(chat.id)).map((message) => message.body)).toEqual([
      "Here",
    ]);
  });

  it("tells a reader which source changed", async () => {
    const { messaging, acme } = makeFake();
    const changes = messaging.changes()[Symbol.asyncIterator]();

    messaging.addInboxItem(acme.id, { question: "Ship it?" });

    expect(await changes.next()).toEqual({ done: false, value: acme.id });
    await changes.return?.();
  });
});

verifies("ports.agent-messaging-avatars", () => {
  it("gives an agent with a picture an avatar ID whose bytes only readAttachment gives", async () => {
    const { messaging, acme } = makeFake();
    const picture = {
      name: "ada.png",
      type: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    };
    messaging.addAgent(acme.id, { name: "Ada", picture });
    messaging.addAgent(acme.id, { name: "Bo" });

    const [ada, bo] = await messaging.listAgents();
    const read = await messaging.readAttachment(ada?.avatar ?? "");

    expect(Object.keys(ada ?? {})).not.toContain("picture");
    expect(bo).not.toHaveProperty("avatar");
    expect(read).toEqual({ outcome: "read", bytes: picture.bytes, type: "image/png" });
  });
});
