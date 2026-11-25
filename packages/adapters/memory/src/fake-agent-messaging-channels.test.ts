// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import type { MessageSendOptions } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

/** A fake with Chief, Liam and Elena in Acme and a channel with Chief (its lead) and Liam. */
function makeFake(options: { channels?: boolean } = {}) {
  const messaging = new FakeAgentMessaging(options);
  const acme = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const liam = messaging.addAgent(acme.id, { name: "Liam" });
  const elena = messaging.addAgent(acme.id, { name: "Elena" });
  const channel = messaging.addConversation(chief.id, {
    title: "Launch",
    members: [chief.id, liam.id],
  });
  return { messaging, acme, chief, liam, elena, channel };
}

verifies("contracts.fake-agent-messaging-channels", () => {
  it("refuses a message sent with `to` naming a non-member as not-found", async () => {
    const { messaging, elena, channel } = makeFake();

    const result = await messaging.send(channel.id, "Can you check this?", [], { to: [elena.id] });

    expect(result).toEqual({ outcome: "refused", reason: "not-found" });
    expect(await messaging.listMessages(channel.id)).toEqual([]);
  });

  it("always records the author of a sent message as me", async () => {
    const { messaging, liam, channel } = makeFake();
    // An app can't say who wrote a message; a field slipped in beside `to` changes nothing.
    const options = { to: [liam.id], author: { kind: "agent", agent: liam.id } };

    const result = await messaging.send(
      channel.id,
      "Over to you",
      [],
      options as MessageSendOptions,
    );
    const [listed] = await messaging.listMessages(channel.id);

    expect(result).toMatchObject({ outcome: "sent", message: { author: { kind: "me" } } });
    expect(listed).toMatchObject({ author: { kind: "me" }, to: [liam.id] });
  });

  it("a failed work line keeps its reason", async () => {
    const { messaging, elena, channel } = makeFake();
    const since = "2026-11-25T10:00:00.000Z";
    messaging.addMessage(channel.id, {
      body: "Can someone check the build?",
      author: { kind: "me" },
      work: [{ agent: elena.id, state: "failed", reason: "Build broke", since }],
    });

    const [listed] = await messaging.listMessages(channel.id);

    expect(listed?.work).toEqual([
      { agent: elena.id, state: "failed", reason: "Build broke", since },
    ]);
  });

  it("refuses startChannel with 1 or 9 agents, or agents of two sources", async () => {
    const { messaging, acme, chief, liam } = makeFake();
    const globex = messaging.addSource({ label: "Paperclip · Globex" });
    const outsider = messaging.addAgent(globex.id, { name: "Chief" });
    const more = ["A", "B", "C", "D", "E", "F", "G"].map(
      (name) => messaging.addAgent(acme.id, { name }).id,
    );
    const before = await messaging.listConversations();

    const one = await messaging.startChannel("Solo", [chief.id], chief.id);
    const nine = await messaging.startChannel("Crowd", [chief.id, liam.id, ...more], chief.id);
    const mixed = await messaging.startChannel("Mixed", [chief.id, outsider.id], chief.id);

    for (const result of [one, nine, mixed]) {
      expect(result).toEqual({ outcome: "refused", reason: "bad-members" });
    }
    expect(await messaging.listConversations()).toEqual(before);
  });

  it("starts a channel and sets its members by the same rule", async () => {
    const { messaging, chief, liam, elena } = makeFake();

    const started = await messaging.startChannel("Docs", [chief.id, liam.id], liam.id);
    if (started.outcome !== "done") throw new Error("the channel wasn't started");
    const changed = await messaging.setMembers(
      started.conversation.id,
      [chief.id, elena.id],
      elena.id,
    );
    const lone = await messaging.setMembers(started.conversation.id, [elena.id], elena.id);

    expect(started.conversation).toMatchObject({ title: "Docs", agent: liam.id });
    expect(changed).toMatchObject({ outcome: "done", conversation: { agent: elena.id } });
    expect(lone).toEqual({ outcome: "refused", reason: "bad-members" });
  });

  it("moves a channel the person leaves to browseChannels, and back when they join", async () => {
    const { messaging, channel } = makeFake();
    const ids = (list: readonly { id: string }[]) => list.map((each) => each.id);

    await messaging.leaveChannel(channel.id);
    const leftList = ids(await messaging.listConversations());
    const leftBrowse = ids(await messaging.browseChannels());
    await messaging.joinChannel(channel.id);

    expect(leftList).not.toContain(channel.id);
    expect(leftBrowse).toEqual([channel.id]);
    expect(ids(await messaging.listConversations())).toContain(channel.id);
    expect(await messaging.browseChannels()).toEqual([]);
  });

  it("refuses a channel call for a direct conversation, offline, or without channels", async () => {
    const { messaging, acme, chief, liam, channel } = makeFake();
    const direct = messaging.addConversation(chief.id);
    const without = makeFake({ channels: false });

    expect(await messaging.joinChannel(direct.id)).toMatchObject({ reason: "not-found" });
    messaging.goOffline(acme.id);
    expect(await messaging.leaveChannel(channel.id)).toMatchObject({ reason: "offline" });
    expect(await messaging.startChannel("Docs", [chief.id, liam.id], chief.id)).toMatchObject({
      reason: "offline",
    });
    expect(
      await without.messaging.startChannel(
        "Docs",
        [without.chief.id, without.liam.id],
        without.chief.id,
      ),
    ).toEqual({ outcome: "refused", reason: "not-supported" });
  });
});
