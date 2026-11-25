import type { AgentMessaging } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeAgentMessaging } from "./fake-agent-messaging.ts";

/**
 * Makes the `AgentMessaging` under test over a fake that sits behind it: a
 * test fills the fake and calls the port. For the fake itself the port is the
 * fake; for a transport, such as the server's routes, it is the client.
 */
export type MakeAgentMessaging = (fake: FakeAgentMessaging) => Promise<AgentMessaging>;

/** A source with an agent, a conversation with one message, an open item and a piece of work. */
function fill(fake: FakeAgentMessaging) {
  const source = fake.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = fake.addAgent(source.id, { name: "Chief" });
  const coder = fake.addAgent(source.id, { name: "Coder" });
  const chat = fake.addConversation(chief.id);
  fake.addMessage(chat.id, { body: "Ship the page?" });
  const item = fake.addInboxItem(source.id, { question: "Ship it?" });
  fake.addWork(source.id, { label: "ACME-1", title: "Ship the page" });
  return { source, chief, coder, chat, item };
}

/**
 * The reader's first change. A reader that connects over a transport sees
 * only the changes made once it is connected, so this keeps making one until
 * the reader sees it; a change it sees twice does no harm.
 */
async function firstChange(
  reader: AsyncIterator<string>,
  change: () => void,
): Promise<IteratorResult<string>> {
  const next = reader.next();
  let seen = false;
  void next.then(() => {
    seen = true;
  });
  while (!seen) {
    change();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return next;
}

/**
 * The contract every `AgentMessaging` passes, whatever carries it
 * (requirement `contracts.agent-messaging`): each call of the port gives what
 * the fake behind it holds, refusals keep their reason, files keep their
 * bytes, and `changes` names the source that changed.
 */
export function agentMessagingContract(name: string, make: MakeAgentMessaging): void {
  async function setUp() {
    const fake = new FakeAgentMessaging();
    const filled = fill(fake);
    return { fake, port: await make(fake), ...filled };
  }

  verifies("contracts.agent-messaging", () => {
    describe(`AgentMessaging contract: ${name}`, () => {
      it("lists what the source holds", async () => {
        const { fake, port, chat } = await setUp();

        expect(await port.listSources()).toEqual(await fake.listSources());
        expect(await port.listAgents()).toEqual(await fake.listAgents());
        expect(await port.listConversations()).toEqual(await fake.listConversations());
        expect(await port.listMessages(chat.id)).toEqual(await fake.listMessages(chat.id));
        expect(await port.listInboxItems()).toEqual(await fake.listInboxItems());
        expect(await port.listWork()).toEqual(await fake.listWork());
        expect(await port.search("Ship")).toEqual(await fake.search("Ship"));
      });

      it("answers an item once, and keeps a refusal's reason", async () => {
        const { port, item } = await setUp();

        const answered = await port.answer(item.id, { kind: "option", option: "yes" });
        const again = await port.answer(item.id, { kind: "reply", text: "No" });
        const missing = await port.answer("no-such-item", { kind: "option", option: "yes" });

        expect(answered.outcome).toBe("answered");
        expect(again).toMatchObject({ outcome: "already-answered", by: { kind: "me" } });
        expect(missing).toEqual({ outcome: "refused", reason: "not-found" });
      });

      it("refuses an action result for an item that isn't an action item", async () => {
        const { port, item } = await setUp();

        const result = await port.answer(item.id, {
          kind: "action-result",
          outcome: "declined",
          steps: [],
        });

        expect(result).toEqual({ outcome: "refused", reason: "bad-answer" });
      });

      it("sends a message with a file to one agent, and reads the file's bytes back", async () => {
        const { port, chat, chief } = await setUp();
        const bytes = new Uint8Array([0, 1, 2, 250, 255]);

        const sent = await port.send(
          chat.id,
          "Here it is",
          [{ name: "a.png", type: "image/png", bytes }],
          {
            to: [chief.id],
          },
        );
        if (sent.outcome !== "sent") throw new Error(`the send was ${sent.outcome}`);
        const [file] = sent.message.attachments;
        const read = await port.readAttachment(file?.id ?? "");

        expect(sent.message).toMatchObject({
          body: "Here it is",
          author: { kind: "me" },
          to: [chief.id],
        });
        expect(read).toEqual({ outcome: "read", type: "image/png", bytes });
      });

      it("refuses every write to an offline source with offline", async () => {
        const { fake, port, source, chat, item } = await setUp();
        fake.goOffline(source.id);

        expect(await port.answer(item.id, { kind: "option", option: "yes" })).toEqual({
          outcome: "refused",
          reason: "offline",
        });
        expect(await port.send(chat.id, "Hello")).toEqual({
          outcome: "refused",
          reason: "offline",
        });
      });

      it("starts a channel, leaves and joins it, and changes its members", async () => {
        const { port, chief, coder } = await setUp();

        const started = await port.startChannel("Launch", [chief.id, coder.id], chief.id);
        if (started.outcome !== "done") throw new Error(`the start was ${started.outcome}`);
        const channel = started.conversation.id;
        const left = await port.leaveChannel(channel);
        const browsed = await port.browseChannels();
        const joined = await port.joinChannel(channel);
        const changed = await port.setMembers(channel, [chief.id, coder.id], coder.id);
        const tooFew = await port.startChannel("Alone", [chief.id], chief.id);

        expect([left.outcome, joined.outcome]).toEqual(["done", "done"]);
        expect(browsed.map((each) => each.id)).toEqual([channel]);
        expect(changed).toMatchObject({ outcome: "done", conversation: { agent: coder.id } });
        expect(tooFew).toEqual({ outcome: "refused", reason: "bad-members" });
      });

      it("names the source that changed to a reader", async () => {
        const { fake, port, source } = await setUp();
        const reader = port.changes()[Symbol.asyncIterator]();

        const first = await firstChange(reader, () => {
          fake.addInboxItem(source.id, { question: "Hire Ana?" });
        });

        expect(first).toEqual({ done: false, value: source.id });
        await reader.return?.();
      });
    });
  });
}
