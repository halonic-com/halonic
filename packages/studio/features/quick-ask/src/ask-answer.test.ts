import type { Message } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { type AnswerState, answerState } from "./ask-answer.ts";
import { AskMemory, memoryStorage } from "./ask-memory.ts";
import { type AskAgent, AskSession } from "./ask-session.ts";
import { agent, card, chat, FakeMessenger, message } from "./test-support/fake-messenger.ts";

/** Lets the session's reads, which wait on the fake's promises, finish. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

/** A session with one chat with Chief, a question sent to it, and a watch while the box is open. */
async function asked(chief = agent("Chief")) {
  const messenger = new FakeMessenger([chat(chief)]);
  const storage = memoryStorage();
  const session = new AskSession(messenger, new AskMemory(storage));
  const opening = await session.open();
  if (opening.kind !== "ready") throw new Error("Expected Chief");
  const outcome = await session.ask(opening.agent, "Where are we with the release?");
  if (outcome.kind !== "sent") throw new Error("Expected the question to be sent");
  return { messenger, storage, session, chief, to: opening.agent, question: outcome.question };
}

function watchAll(session: AskSession, to: AskAgent, question: Message) {
  const states: AnswerState[] = [];
  const stop = session.watch(to, question, (state) => states.push(state));
  return { states, stop };
}

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("quick-ask.answer", () => {
  it("shows the agent's reply once its source changes", async () => {
    const { messenger, session, chief, to, question } = await asked();
    const { states } = watchAll(session, to, question);
    await settle();
    expect(states.at(-1)).toEqual({ kind: "waiting" });

    messenger.reply(chief, "The release is on Friday.", "2026-11-25T13:41:00.000Z");
    messenger.change("acme");
    await settle();

    const last = states.at(-1);
    expect(last?.kind).toBe("answer");
    if (last?.kind === "answer") {
      expect(last.messages.map((each) => each.body)).toEqual(["The release is on Friday."]);
    }
  });

  it("says the agent is working, and doesn't take an older card for the answer", async () => {
    const { messenger, session, chief, to, question } = await asked();
    messenger.cardsOf = [card(chief, "Ship it?", "2026-11-25T12:00:00.000Z")];
    const { states } = watchAll(session, to, question);
    messenger.chats = [chat(agent("Chief", "working"))];
    messenger.change("acme");
    await settle();

    expect(states.at(-1)).toEqual({ kind: "working" });
  });

  it("sends a new card to Messenger instead of answering it in the box", async () => {
    const { messenger, session, chief, to, question } = await asked();
    const { states } = watchAll(session, to, question);
    messenger.cardsOf = [card(chief, "Ship it on Friday?", "2026-11-25T13:42:00.000Z")];
    messenger.change("acme");
    await settle();

    expect(states.at(-1)?.kind).toBe("card");
  });

  it("reads only on changes of the agent's own source", async () => {
    const { messenger, session, to, question } = await asked();
    const { states } = watchAll(session, to, question);
    await settle();
    messenger.change("another-source");
    await settle();

    expect(states).toHaveLength(1);
  });

  it("stops reading when the box closes", async () => {
    const { messenger, session, chief, to, question } = await asked();
    const { states, stop } = watchAll(session, to, question);
    await settle();
    stop();

    expect(messenger.listeners.size).toBe(0);
    messenger.reply(chief, "Too late for the box.", "2026-11-25T13:41:00.000Z");
    messenger.change("acme");
    await settle();
    expect(states).toEqual([{ kind: "waiting" }]);
  });

  it("keeps watching after a read fails, and says so", async () => {
    const { messenger, session, chief, to, question } = await asked();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const messages = vi.spyOn(messenger, "messages").mockRejectedValueOnce(new Error("offline"));
    const { states } = watchAll(session, to, question);
    await settle();
    expect(logged).toHaveBeenCalledOnce();

    messages.mockRestore();
    messenger.reply(chief, "Back again.", "2026-11-25T13:41:00.000Z");
    messenger.change("acme");
    await settle();
    expect(states.at(-1)?.kind).toBe("answer");
  });

  it("offers an answer that came after the box closed as the last answer", async () => {
    const { messenger, storage, chief } = await asked();
    messenger.reply(chief, "The release is on Friday.", "2026-11-25T13:41:00.000Z");

    const session = new AskSession(messenger, new AskMemory(storage));
    const opening = await session.open();
    expect(opening.kind === "ready" ? opening.lastAnswer : undefined).toEqual({
      conversation: "chat-Chief",
      agentName: "Chief",
      sentAt: "2026-11-25T13:41:00.000Z",
    });

    session.forgetLastAnswer();
    const again = await session.open();
    expect(again.kind === "ready" ? again.lastAnswer : "none").toBeUndefined();
  });

  it("offers no last answer once the box showed it", async () => {
    const { messenger, storage, session, chief, to, question } = await asked();
    watchAll(session, to, question);
    messenger.reply(chief, "The release is on Friday.", "2026-11-25T13:41:00.000Z");
    messenger.change("acme");
    await settle();

    const opening = await new AskSession(messenger, new AskMemory(storage)).open();
    expect(opening.kind === "ready" ? opening.lastAnswer : "none").toBeUndefined();
  });

  it("compares times as instants, whatever their precision or offset", () => {
    const chief = agent("Chief");
    const facts = { agent: chief, cards: [], sentAt: "2026-11-25T13:40:00.000Z" };
    // 13:30 UTC, before the question, though its text sorts after it.
    const older = message("chat-Chief", "Earlier news.", "2026-11-25T14:30:00+01:00", chief);
    expect(answerState({ ...facts, messages: [older] })).toEqual({ kind: "waiting" });

    // 14:39 UTC, after the question, though its text sorts before it.
    const newCard = card(chief, "Ship it?", "2026-11-25T13:39:00-01:00");
    expect(answerState({ ...facts, messages: [], cards: [newCard] }).kind).toBe("card");

    const reply = message("chat-Chief", "Friday.", "2026-11-25T13:40:01Z", chief);
    expect(answerState({ ...facts, messages: [reply] }).kind).toBe("answer");
  });

  it("keeps another workspace's waiting question out of this one's last answer", async () => {
    const { messenger, storage, chief } = await asked();
    messenger.reply(chief, "The release is on Friday.", "2026-11-25T13:41:00.000Z");
    const elsewhere = new FakeMessenger([chat(agent("Liam"))]);

    const there = await new AskSession(elsewhere, new AskMemory(storage)).open();
    expect(there.kind === "ready" ? there.lastAnswer : "none").toBeUndefined();

    const back = await new AskSession(messenger, new AskMemory(storage)).open();
    expect(back.kind === "ready" ? back.lastAnswer?.agentName : undefined).toBe("Chief");
  });
});

verifies("quick-ask.automatic-notes", () => {
  it("doesn't take an automatic note for the answer, only the agent's own message", () => {
    const chief = agent("Chief", "working");
    const facts = { agent: chief, cards: [], sentAt: "2026-11-25T13:40:00.000Z" };
    const receipt = {
      ...message("chat-Chief", "On it.", "2026-11-25T13:40:05.000Z", chief),
      automatic: true,
    };
    expect(answerState({ ...facts, messages: [receipt] })).toEqual({ kind: "working" });

    const reply = message("chat-Chief", "Friday.", "2026-11-25T13:41:00.000Z", chief);
    expect(answerState({ ...facts, messages: [receipt, reply] })).toEqual({
      kind: "answer",
      messages: [reply],
    });
  });

  it("offers no automatic note as the last answer", async () => {
    const { messenger, storage, chief } = await asked();
    messenger.note(chief, "On it.", "2026-11-25T13:41:00.000Z");

    const opening = await new AskSession(messenger, new AskMemory(storage)).open();
    expect(opening.kind === "ready" ? opening.lastAnswer : "none").toBeUndefined();
  });
});
