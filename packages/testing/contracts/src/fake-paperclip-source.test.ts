import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakePaperclipSource } from "./fake-paperclip-source.ts";

/** A fake whose clock the test moves by hand. */
function makeSource(): { source: FakePaperclipSource; setTime: (iso: string) => void } {
  let now = new Date("2026-11-24T10:00:00.000Z");
  const source = new FakePaperclipSource({ now: () => now });
  return { source, setTime: (iso) => (now = new Date(iso)) };
}

verifies("contracts.fake-paperclip-source", () => {
  it("names every item it gives with its connection and company", async () => {
    const { source } = makeSource();
    source.addAgent({ name: "Chief" });
    const agents = await source.listAgents();
    expect(agents.items[0]?.ref).toMatchObject({ connection: "acme", company: "acme-co" });
    expect(agents.offline).toBe(false);
  });

  it("answers an open card once and reports a card answered elsewhere", async () => {
    const { source } = makeSource();
    const task = source.addTask({ key: "ACME-10", title: "Chat with Chief" });
    const first = source.addCard({ task: task.ref, question: "Ship it?" });
    const second = source.addCard({ task: task.ref, question: "Hire Ana?" });

    const answered = await source.answerCard(first.ref, { kind: "option", option: "yes" });
    const again = await source.answerCard(first.ref, { kind: "option", option: "no" });
    source.answerElsewhere(
      second.ref,
      { kind: "board", name: "Web page" },
      {
        kind: "reply",
        text: "Not yet",
      },
    );
    const late = await source.answerCard(second.ref, { kind: "option", option: "yes" });

    expect(answered.outcome).toBe("answered");
    expect(again).toMatchObject({ outcome: "already-answered", by: { kind: "board" } });
    expect(late).toMatchObject({ outcome: "already-answered", by: { name: "Web page" } });
  });

  it("refuses an item of another connection or company as not found", async () => {
    const { source } = makeSource();
    const chief = source.addAgent({ name: "Chief" });
    const task = source.addTask({ key: "ACME-10", title: "Chat", chatWith: chief.ref });
    const card = source.addCard({ task: task.ref, question: "Ship it?" });

    const otherConnection = { ...card.ref, connection: "globex" };
    const otherCompany = { ...task.ref, company: "globex-co" };

    expect(await source.answerCard(otherConnection, { kind: "option", option: "yes" })).toEqual({
      outcome: "refused",
      reason: "not-found",
    });
    expect(await source.commentOnChat(otherCompany, "Hi")).toEqual({
      outcome: "refused",
      reason: "not-found",
    });
  });

  it("comments only on a chat task", async () => {
    const { source } = makeSource();
    const chief = source.addAgent({ name: "Chief" });
    const chat = source.addTask({ key: "ACME-10", title: "Chat", chatWith: chief.ref });
    const plain = source.addTask({ key: "ACME-11", title: "Build it" });

    const sent = await source.commentOnChat(chat.ref, "Morning, Chief");
    const refused = await source.commentOnChat(plain.ref, "Hello");
    const comments = await source.listComments(chat.ref);

    expect(sent).toMatchObject({ outcome: "sent", comment: { body: "Morning, Chief" } });
    expect(refused).toEqual({ outcome: "refused", reason: "not-a-chat" });
    expect(comments.items.map((comment) => comment.body)).toEqual(["Morning, Chief"]);
  });

  it("offline, gives the last read as of its time and refuses writes without queueing them", async () => {
    const { source, setTime } = makeSource();
    const chief = source.addAgent({ name: "Chief" });
    const chat = source.addTask({ key: "ACME-10", title: "Chat", chatWith: chief.ref });
    const card = source.addCard({ task: chat.ref, question: "Ship it?" });
    await source.listCards();

    setTime("2026-11-24T10:05:00.000Z");
    source.goOffline();
    const cards = await source.listCards();
    const answer = await source.answerCard(card.ref, { kind: "option", option: "yes" });
    const message = await source.commentOnChat(chat.ref, "Still there?");

    expect(cards).toMatchObject({ offline: true, asOf: "2026-11-24T10:00:00.000Z" });
    expect(cards.items[0]?.state.kind).toBe("open");
    expect(answer).toEqual({ outcome: "refused", reason: "offline" });
    expect(message).toEqual({ outcome: "refused", reason: "offline" });

    source.goOnline();
    expect((await source.listComments(chat.ref)).items).toEqual([]);
    expect((await source.listCards()).items[0]?.state.kind).toBe("open");
  });

  it("lists tasks newest change first and cards newest first", async () => {
    const { source } = makeSource();
    source.addTask({ key: "ACME-1", title: "Old", updatedAt: "2026-11-20T09:00:00.000Z" });
    source.addTask({ key: "ACME-2", title: "New", updatedAt: "2026-11-23T09:00:00.000Z" });
    source.addProject({ name: "Phase 1" });
    const task = source.addTask({
      key: "ACME-3",
      title: "Cards",
      updatedAt: "2026-11-21T09:00:00.000Z",
    });
    source.addCard({ task: task.ref, question: "First?" });
    source.addCard({ task: task.ref, question: "Second?" });

    expect((await source.listTasks()).items.map((each) => each.key)).toEqual([
      "ACME-2",
      "ACME-3",
      "ACME-1",
    ]);
    expect((await source.listCards()).items.map((each) => each.question)).toEqual([
      "Second?",
      "First?",
    ]);
    expect((await source.listProjects()).items).toHaveLength(1);
  });
});
