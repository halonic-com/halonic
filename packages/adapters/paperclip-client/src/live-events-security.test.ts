import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { company, testKey } from "./acme-data.test-helper.ts";
import { UnsafeAddressError } from "./address.ts";
import { connectTo, FakeEventsServer, textFrame } from "./live-events.test-helper.ts";
import { LiveEventsConnection, liveFrameMaxBytes } from "./live-events.ts";
import { upgradeSocket } from "./live-socket.ts";
import { paperclipRequests } from "./requests.ts";
import { PaperclipClientError, PaperclipTransport } from "./transport.ts";

let paperclip: FakeEventsServer;

beforeEach(async () => {
  paperclip = await new FakeEventsServer().start();
});

afterEach(async () => {
  await paperclip.stop();
});

/** A server text frame's header that declares `length` bytes, with none of them sent. */
function textHeader(length: number): Buffer {
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return header;
}

verifies("paperclip-client.live-events", () => {
  describe("the key", () => {
    it("goes only in the Authorization header, never in the address", async () => {
      const { connection, signals } = connectTo(paperclip);
      await connection.open();
      expect(signals).toEqual([{ kind: "open" }]);
      const [head] = paperclip.heads;
      const [requestLine, ...headers] = (head ?? "").split("\r\n");
      expect(requestLine).toBe(`GET /api/companies/${company}/events/ws HTTP/1.1`);
      expect(requestLine).not.toContain("?");
      expect(headers).toContain(`Authorization: Bearer ${testKey}`);
      expect(head?.split(testKey)).toHaveLength(2);
      expect(head?.toLowerCase()).not.toContain("token=");
      connection.close();
    });

    it("sends live.hello and live.interests with no run IDs, and nothing else", async () => {
      const { connection } = connectTo(paperclip);
      await connection.open();
      const frames = await paperclip.framesSent(2);
      const sent = frames.map((frame) =>
        frame.kind === "message" ? JSON.parse(Buffer.from(frame.bytes).toString()) : frame.kind,
      );
      expect(sent).toEqual([
        { type: "live.hello", version: 1 },
        { type: "live.interests", version: 1, revision: 1, runIds: [] },
      ]);
      connection.close();
    });

    it("is never sent by fetch: the liveEvents row is an upgrade only", async () => {
      expect(paperclipRequests.liveEvents).toEqual({
        method: "GET",
        path: "/api/companies/:company/events/ws",
        upgrade: true,
      });
      const transport = new PaperclipTransport({ address: paperclip.address, key: testKey });
      await expect(transport.send("liveEvents", { path: { company } })).rejects.toThrow(
        "is a WebSocket, not a request",
      );
      expect(() =>
        transport.openSocket("listAgents", { company }, async () => ({ kind: "ok", body: null })),
      ).toThrow(PaperclipClientError);
      expect(paperclip.heads).toEqual([]);
    });
  });

  describe("the address", () => {
    it("refuses plain http, so plain ws, to another computer", () => {
      expect(
        () =>
          new LiveEventsConnection({
            address: "http://paperclip.acme.example",
            key: testKey,
            company,
            onSignal: () => {},
          }),
      ).toThrow(UnsafeAddressError);
    });

    it("refuses a ws address to another computer before connecting", async () => {
      const opened: unknown[] = [];
      await expect(
        upgradeSocket(
          new URL(`ws://paperclip.acme.example/api/companies/${company}/events/ws`),
          `Bearer ${testKey}`,
          (upgraded) => opened.push(upgraded),
        ),
      ).rejects.toMatchObject({ reason: "refused" });
      expect(opened).toEqual([]);
    });
  });

  describe("wss", () => {
    it("sends nothing in the clear: a server that doesn't speak TLS never sees the request", async () => {
      const port = new URL(paperclip.address).port;
      const url = new URL(`wss://127.0.0.1:${port}/api/companies/${company}/events/ws`);
      const answer = await upgradeSocket(url, `Bearer ${testKey}`, () => {}, 50);
      expect(answer).toEqual({ kind: "failed", failure: "offline" });
      const seen = Buffer.concat(paperclip.beforeHeads);
      expect(seen[0]).toBe(0x16); // a TLS handshake record, not "GET"
      expect(seen.includes(testKey)).toBe(false);
      expect(paperclip.heads).toEqual([]);
    });
  });

  describe("redirects", () => {
    it("follows none, to another server or the same one", async () => {
      const elsewhere = await new FakeEventsServer().start();
      try {
        for (const target of [elsewhere.address, paperclip.address]) {
          paperclip.answer = () =>
            `HTTP/1.1 302 Found\r\nLocation: ${target}/api/companies/${company}/events/ws\r\n\r\n`;
          const { connection, signals } = connectTo(paperclip);
          await connection.open();
          expect(signals).toEqual([{ kind: "closed", code: 1006, why: "redirect" }]);
        }
        expect(elsewhere.heads).toEqual([]);
        expect(paperclip.heads).toHaveLength(2);
      } finally {
        await elsewhere.stop();
      }
    });
  });

  describe("frame size", () => {
    it("closes with 1009 on a frame over 1 MB, from its header alone", async () => {
      paperclip.onOpen = (socket) => socket.write(textHeader(liveFrameMaxBytes + 1));
      const { connection, closed } = connectTo(paperclip);
      await connection.open();
      expect(await closed).toEqual({ kind: "closed", code: 1009, why: "too-large" });
      const frames = await paperclip.framesSent(3);
      expect(frames[2]).toEqual({ kind: "close", bytes: Buffer.from([0x03, 0xf1]) });
    });

    it("reads a frame of exactly 1 MB", async () => {
      const event = {
        type: "activity.logged",
        companyId: company,
        createdAt: "2026-11-26T08:00:00.000Z",
        payload: { action: "issue.comment_added", entityType: "issue", entityId: "t-1" },
      };
      const padding = liveFrameMaxBytes - JSON.stringify({ ...event, pad: "" }).length;
      paperclip.onOpen = (socket) =>
        socket.write(textFrame({ ...event, pad: "x".repeat(padding) }));
      const { connection, signalsCame } = connectTo(paperclip);
      await connection.open();
      const signals = await signalsCame(2);
      expect(signals[1]).toMatchObject({ kind: "event", event: { entityId: "t-1" } });
      connection.close();
    });
  });
});
