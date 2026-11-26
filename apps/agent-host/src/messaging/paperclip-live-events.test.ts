import { join } from "node:path";
import { serverPairingSecretName } from "@halonicjs/ports";
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

/** How many times the fake Paperclip was asked for the company's chats. */
function chatReads(on: Desktop): number {
  const path = `/api/companies/${acme.company}/chats`;
  return on.paperclip.seen.filter((request) => new URL(request.url).pathname === path).length;
}

const newMessageAt = "2026-11-24T14:00:01.000Z";

verifies("agent-host.paperclip-live-events", () => {
  describe("the desktop engine's live events", () => {
    it("a new comment's event makes the message readable from the local copy within 2 seconds, counted as an event", async () => {
      const on = await connectedWithEvents();
      on.paperclip.chat = { ...on.paperclip.chat, updatedAt: newMessageAt };
      on.paperclip.comments = [
        { id: "c2", body: "Shipped.", authorAgentId: "agent-ada", createdAt: newMessageAt },
      ];
      const before = await on.counters.diagnostics().updates.event.count;

      const signal = eventsSignalOf({
        kind: "event",
        event: {
          kind: "activity",
          action: "issue.comment_added",
          entityType: "issue",
          entityId: "task-1",
          createdAt: newMessageAt,
        },
      });
      expect(signal).toEqual({ kind: "change" });
      if (signal !== undefined) on.sockets.say(signal);
      await settle();
      // The batch ends 300 ms after the event and asks for a read, which the scheduler runs next.
      await on.wait(300);
      await on.wait(0);

      const [conversation] = await on.studio.listConversations();
      expect(conversation?.updatedAt).toBe(newMessageAt);
      const messages = await on.studio.listMessages(conversation?.id ?? "");
      expect(messages.map((message) => message.body)).toEqual(["Shipped."]);
      expect(on.counters.diagnostics().updates.event.count).toBeGreaterThan(before);
      expect(on.logged).toEqual([]);
    });

    it("an event that touches nothing the local copy keeps brings no read", async () => {
      const on = await connectedWithEvents();
      const reads = chatReads(on);

      const signal = eventsSignalOf({
        kind: "event",
        event: { kind: "other", type: "heartbeat.run.activity", createdAt: newMessageAt },
      });
      if (signal !== undefined) on.sockets.say(signal);
      await settle();
      await on.wait(2_000);

      expect(signal).toBeUndefined();
      expect(chatReads(on)).toBe(reads);
    });

    it("a 403 on connect stops the retries, and the sync polls at the rates without events", async () => {
      const on = await connectedWithEvents();
      const readsWithEvents = chatReads(on);
      for (let step = 0; step < 5; step += 1) await on.wait(10_000);
      // With events a window that is open polls once a minute.
      expect(chatReads(on)).toBe(readsWithEvents);
      expect(on.counters.diagnostics().connection).toBe("connected");

      const refused = eventsSignalOf({ kind: "closed", code: 1006, why: "not-allowed" });
      if (refused !== undefined) on.sockets.say(refused);
      await settle();
      const readsRefused = chatReads(on);
      for (let step = 0; step < 6; step += 1) await on.wait(10_000);

      // Without events it polls every 10 seconds, and never opens the socket again.
      expect(chatReads(on) - readsRefused).toBe(6);
      expect(on.sockets.opened).toHaveLength(1);
      expect(on.counters.diagnostics().connection).toBe("not-allowed");
    });

    it("a dropped socket is opened again after a wait", async () => {
      const on = await connectedWithEvents();

      const dropped = eventsSignalOf({ kind: "closed", code: 1006, why: "closed" });
      if (dropped !== undefined) on.sockets.say(dropped);
      await settle();
      await on.wait(60_000);

      expect(on.sockets.opened).toHaveLength(2);
    });

    it("Disconnect closes the socket, and none opens again", async () => {
      const on = await connectedWithEvents();

      await on.paperclipKey.disconnect({ workspace: on.workspace, connection: "halonic" });
      await settle();
      await on.wait(60_000);

      expect(on.sockets.opened).toHaveLength(1);
      expect(on.sockets.opened[0]?.closed).toBe(true);
    });

    it("Disconnect while a dropped socket waits to open again cancels that attempt", async () => {
      const on = await connectedWithEvents();
      const dropped = eventsSignalOf({ kind: "closed", code: 1006, why: "closed" });
      if (dropped !== undefined) on.sockets.say(dropped);
      await settle();

      await on.paperclipKey.disconnect({ workspace: on.workspace, connection: "halonic" });
      await settle();
      await on.wait(60_000);

      expect(on.sockets.opened).toHaveLength(1);
    });

    it("switching the workspace to a server closes its socket, and leaving the server opens a new one", async () => {
      const on = await connectedWithEvents();
      const { key } = await on.setting.read(on.workspace);
      await on.keychain.set(serverPairingSecretName(key), on.server.token);
      await on.setting.useServer(on.workspace, on.server.address);

      await on.messaging.switchEngine(on.workspace);
      await settle();
      await on.wait(60_000);
      expect(on.sockets.opened).toHaveLength(1);
      expect(on.sockets.opened[0]?.closed).toBe(true);

      await on.setting.useThisComputer(on.workspace);
      await on.messaging.leaveServer(on.workspace);

      expect(on.sockets.opened).toHaveLength(2);
      expect(on.sockets.opened[1]?.closed).toBe(false);
    });

    it("a socket that fails to open on leaving the server is logged, and the server's cache is still deleted", async () => {
      const on = await connectedWithEvents();
      const { key } = await on.setting.read(on.workspace);
      await on.keychain.set(serverPairingSecretName(key), on.server.token);
      await on.setting.useServer(on.workspace, on.server.address);
      await on.messaging.switchEngine(on.workspace);
      await on.studio.listAgents();
      const cache = join(on.profile, "agent-messaging-cache");
      expect((await on.filesIn(cache)).size).toBeGreaterThan(0);

      on.failLiveAdds(new Error("timer not set"));
      await on.setting.useThisComputer(on.workspace);
      await on.messaging.leaveServer(on.workspace);

      expect([...(await on.filesIn(cache)).keys()]).toEqual([]);
      expect(on.logged).toContain("paperclip:halonic live events\n");
    });
  });
});
