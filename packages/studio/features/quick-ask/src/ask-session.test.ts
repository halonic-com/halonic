import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { AskMemory, type AskStorage, memoryStorage } from "./ask-memory.ts";
import { type AskAgent, AskSession } from "./ask-session.ts";
import { agent, chat, FakeMessenger } from "./test-support/fake-messenger.ts";

const chief = agent("Chief");
const liam = agent("Liam");

/** A session over `messenger`, and its storage, which outlives the session as the page's does. */
function sessionWith(messenger: FakeMessenger, storage: AskStorage = memoryStorage()) {
  return { session: new AskSession(messenger, new AskMemory(storage)), storage };
}

async function ready(session: AskSession) {
  const opening = await session.open();
  if (opening.kind !== "ready") throw new Error(`Expected agents, got ${opening.kind}`);
  return opening;
}

function names(agents: readonly AskAgent[]): string[] {
  return agents.map((each) => each.agent.name);
}

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("quick-ask.session", () => {
  it("offers the 1:1 chats and no channels, and picks the first agent the first time", async () => {
    const messenger = new FakeMessenger([chat(chief), chat(liam, [liam, chief]), chat(liam)]);
    const opening = await ready(sessionWith(messenger).session);

    expect(names(opening.agents)).toEqual(["Chief", "Liam"]);
    expect(opening.agent.agent.name).toBe("Chief");
    expect(opening.text).toBe("");
  });

  it("says there are no agents when there is no 1:1 chat", async () => {
    const messenger = new FakeMessenger([chat(liam, [liam, chief])]);
    expect(await sessionWith(messenger).session.open()).toEqual({ kind: "no-agents" });
  });

  it("picks the agent picked last, in a new window too", async () => {
    const messenger = new FakeMessenger([chat(chief), chat(liam)]);
    const first = sessionWith(messenger);
    const opening = await ready(first.session);
    first.session.pick(opening.agents[1] ?? opening.agent);

    const again = await ready(sessionWith(messenger, first.storage).session);
    expect(again.agent.agent.name).toBe("Liam");
  });

  it("keeps the unsent text for the next window", async () => {
    const messenger = new FakeMessenger([chat(chief)]);
    const first = sessionWith(messenger);
    first.session.type("Where are we?");

    const again = await ready(sessionWith(messenger, first.storage).session);
    expect(again.text).toBe("Where are we?");
  });

  it("sends the question as a message in the agent's chat and clears the box", async () => {
    const messenger = new FakeMessenger([chat(chief), chat(liam)]);
    const { session, storage } = sessionWith(messenger);
    const opening = await ready(session);
    const liamChat = opening.agents[1] ?? opening.agent;
    session.type("Where are we with the release?");

    const outcome = await session.ask(liamChat, "Where are we with the release?");

    expect(outcome.kind).toBe("sent");
    expect(messenger.messagesOf.get("chat-Liam")?.map((each) => each.body)).toEqual([
      "Where are we with the release?",
    ]);
    const again = await ready(sessionWith(messenger, storage).session);
    expect(again.text).toBe("");
    expect(again.agent.agent.name).toBe("Liam");
  });

  it("keeps the text with the reason when the question isn't sent", async () => {
    const messenger = new FakeMessenger([chat(chief)]);
    messenger.refuse = "offline";
    const { session, storage } = sessionWith(messenger);
    const opening = await ready(session);
    session.type("Where are we?");

    expect(await session.ask(opening.agent, "Where are we?")).toEqual({
      kind: "not-sent",
      reason: "offline",
    });
    expect(messenger.messagesOf.get("chat-Chief")).toBeUndefined();
    expect((await ready(sessionWith(messenger, storage).session)).text).toBe("Where are we?");
  });

  it("still opens when the page's storage can't be read or written", async () => {
    const broken: AskStorage = {
      getItem: () => {
        throw new Error("storage is off");
      },
      setItem: () => {
        throw new Error("storage is full");
      },
      removeItem: () => {
        throw new Error("storage is off");
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const messenger = new FakeMessenger([chat(chief)]);
    const { session } = sessionWith(messenger, broken);
    session.type("Hello");

    const opening = await ready(session);
    expect(opening.agent.agent.name).toBe("Chief");
    expect(opening.text).toBe("");
    expect(logged).toHaveBeenCalled();
  });
});
