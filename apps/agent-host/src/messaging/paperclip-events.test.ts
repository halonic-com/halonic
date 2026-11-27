import { once } from "node:events";
import { type AddressInfo, createServer } from "node:net";
import { LiveTaskChanges } from "@halonicjs/adapter-paperclip-client";
import { PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import type { EventsSignal } from "@halonicjs/host-paperclip-sync";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { liveSignalHandler, paperclipEvents } from "./paperclip-provider.ts";

// A fake key only these tests use.
const testKey = "pcp_board_fake-key-for-events-tests-only";
const binding = { workspace: "/acme/workspace", connection: "halonic" };

/** A server on 127.0.0.1 that counts the connections it gets and drops each at once. */
let server: { address: string; connections: () => number; stop: () => Promise<void> };

beforeEach(async () => {
  let connections = 0;
  const listening = createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  listening.listen(0, "127.0.0.1");
  await once(listening, "listening");
  const { port } = listening.address() as AddressInfo;
  server = {
    address: `http://127.0.0.1:${port}`,
    connections: () => connections,
    stop: () => new Promise((resolve) => listening.close(() => resolve())),
  };
});

afterEach(async () => {
  await server.stop();
});

/** The keys with one for {@link binding} at the server's address. */
function keysWithKey(): PaperclipKeys {
  const keys = new PaperclipKeys();
  keys.replace(binding, { key: testKey, address: server.address, company: "acme-company" });
  return keys;
}

/** Opens one attempt and waits for what it says first. */
function firstSignal(open: ReturnType<typeof paperclipEvents>): Promise<EventsSignal> {
  return new Promise((resolve) => {
    open?.((signal) => resolve(signal));
  });
}

verifies("agent-host.paperclip-live-events", () => {
  describe("paperclipEvents", () => {
    it("opens nothing for a connection the host holds no key for", () => {
      const open = paperclipEvents(
        { binding, keys: new PaperclipKeys(), readNow: async () => undefined },
        () => {},
      );

      expect(open).toBeUndefined();
    });

    it("says closed and refused, and sends nothing, when the connection file is gone", async () => {
      const reported: unknown[] = [];
      const open = paperclipEvents(
        { binding, keys: keysWithKey(), readNow: async () => undefined },
        (error) => reported.push(error),
      );

      expect(await firstSignal(open)).toEqual({ kind: "closed", refused: true });
      expect(server.connections()).toBe(0);
      expect(reported).toEqual([]);
    });

    it("reports a read of the connection file that throws, and says closed, not refused", async () => {
      const unreadable = new Error("The connection file can't be read.");
      const reported: unknown[] = [];
      const open = paperclipEvents(
        {
          binding,
          keys: keysWithKey(),
          readNow: () => Promise.reject(unreadable),
        },
        (error) => reported.push(error),
      );

      expect(await firstSignal(open)).toEqual({ kind: "closed", refused: false });
      expect(reported).toEqual([unreadable]);
      expect(server.connections()).toBe(0);
    });

    it("connects to the address the key was made for while the file still names it", async () => {
      const open = paperclipEvents(
        {
          binding,
          keys: keysWithKey(),
          readNow: async () => ({ address: server.address, company: "acme-company" }),
        },
        () => {},
      );

      // The server drops the socket before answering, so the attempt ends as a drop, not a refusal.
      expect(await firstSignal(open)).toEqual({ kind: "closed", refused: false });
      expect(server.connections()).toBe(1);
    });
  });
});

verifies("paperclip-client.event-card-reads", () => {
  describe("liveSignalHandler", () => {
    it("names an event's task to the provider before the sync hears the change (HAL-20614)", () => {
      const liveTasks = new LiveTaskChanges();
      const heard: string[][] = [];
      const handle = liveSignalHandler(liveTasks, (signal) => {
        heard.push([signal.kind, ...liveTasks.take()]);
      });

      handle({
        kind: "event",
        event: {
          kind: "activity",
          action: "issue.thread_interaction_created",
          entityType: "issue",
          entityId: "task-1",
          createdAt: "2026-11-24T14:00:01.000Z",
        },
      });
      handle({ kind: "resync" });

      expect(heard).toEqual([["change", "task-1"], ["resync"]]);
    });
  });
});
