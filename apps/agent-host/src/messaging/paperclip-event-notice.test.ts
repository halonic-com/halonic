import { paperclipSourceId } from "@halonicjs/adapter-paperclip-client";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";
import { eventsSignalOf } from "./paperclip-provider.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** A desktop with `halonic` connected and synced once, its events socket open and caught up. */
async function connectedWithEvents(): Promise<Desktop> {
  desktop = await startDesktop();
  desktop.paperclip.servesInbox = true;
  await desktop.paperclipKey.handOver({
    workspace: desktop.workspace,
    connection: "halonic",
    key: testKey,
    ...acme,
  });
  await desktop.wait(0);
  desktop.sockets.say({ kind: "open" });
  await settle();
  await desktop.wait(0);
  return desktop;
}

/** Lets every promise that is already settled run its callbacks; no time passes. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Holds the full read's approvals request open until the returned `release` is called. */
function holdFullRead(on: Desktop): { started: Promise<void>; release: () => void } {
  let release = () => {};
  let arrived = () => {};
  const started = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  on.paperclip.hold = { path: `/api/companies/${acme.company}/approvals`, arrived, until };
  return { started, release: () => release() };
}

const newMessageAt = "2026-11-24T14:00:01.000Z";
const commentEvent = eventsSignalOf({
  kind: "event",
  event: {
    kind: "activity",
    action: "issue.comment_added",
    entityType: "issue",
    entityId: "task-1",
    createdAt: newMessageAt,
  },
});

verifies("agent-host.paperclip-event-notice", () => {
  describe("an event reaches Studio before the read it brings ends", () => {
    it("a new comment reads in the chat 300 ms after its event, while the full read still runs", async () => {
      const on = await connectedWithEvents();
      const workspace = await on.messaging.of(on.workspace);
      const after = workspace?.changesSince(0).next ?? 0;
      const [conversation] = await on.studio.listConversations();
      on.paperclip.comments = [
        { id: "c2", body: "Shipped.", authorAgentId: "agent-ada", createdAt: newMessageAt },
      ];
      const fullRead = holdFullRead(on);

      if (commentEvent !== undefined) on.sockets.say(commentEvent);
      await settle();
      // The batch ends 300 ms after the event and asks for a read, which the scheduler runs next.
      const passing = on.wait(300).then(() => on.wait(0));
      await fullRead.started;

      expect(workspace?.changesSince(after).sources).toEqual([paperclipSourceId("halonic")]);
      const messages = await on.studio.listMessages(conversation?.id ?? "");
      expect(messages.map((message) => message.body)).toEqual(["Shipped."]);

      fullRead.release();
      await passing;
      expect(on.logged).toEqual([]);
    });

    it("a resync names the source only once its read changed the local copy", async () => {
      const on = await connectedWithEvents();
      const workspace = await on.messaging.of(on.workspace);
      const after = workspace?.changesSince(0).next ?? 0;
      on.paperclip.chat = { ...on.paperclip.chat, updatedAt: newMessageAt };
      const fullRead = holdFullRead(on);

      on.sockets.say({ kind: "resync" });
      await settle();
      // The batch ends 300 ms after the event and asks for a read, which the scheduler runs next.
      const passing = on.wait(300).then(() => on.wait(0));
      await fullRead.started;
      expect(workspace?.changesSince(after).sources).toEqual([]);

      fullRead.release();
      await passing;
      expect(workspace?.changesSince(after).sources).toEqual([paperclipSourceId("halonic")]);
    });
  });
});
