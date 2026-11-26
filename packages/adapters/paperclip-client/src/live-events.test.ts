import type { Socket } from "node:net";
import { encodeFrame, frameType } from "@halonicjs/adapter-websocket-frames";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { company, testKey } from "./acme-data.test-helper.ts";
import {
  connectTo,
  FakeEventsServer,
  textFrame,
  textHeader,
  upgradeAnswer,
} from "./live-events.test-helper.ts";
import { LiveEventsConnection, type LiveSignal, liveFrameMaxBytes } from "./live-events.ts";

let paperclip: FakeEventsServer;

beforeEach(async () => {
  paperclip = await new FakeEventsServer().start();
});

afterEach(async () => {
  await paperclip.stop();
});

const createdAt = "2026-11-26T08:00:00.000Z";

const commentAdded = {
  type: "activity.logged",
  companyId: company,
  createdAt,
  payload: { action: "issue.comment_added", entityType: "issue", entityId: "t-1", body: "secret" },
};

/** The signals of a connection whose upgrade Paperclip answers with `answer`. */
async function signalsFor(answer: (head: string) => string): Promise<LiveSignal[]> {
  paperclip.answer = answer;
  const { connection, signals } = connectTo(paperclip);
  await connection.open();
  return signals;
}

verifies("paperclip-client.live-events", () => {
  describe("a refused upgrade", () => {
    it("is not-allowed for 403, signed-out for 401 and refused for anything else", async () => {
      const answers = [403, 401, 500].map((status) => `HTTP/1.1 ${status} No\r\n\r\n`);
      const whys = [];
      for (const answer of answers) whys.push((await signalsFor(() => answer))[0]);
      expect(whys).toEqual([
        { kind: "closed", code: 1006, why: "not-allowed" },
        { kind: "closed", code: 1006, why: "signed-out" },
        { kind: "closed", code: 1006, why: "refused" },
      ]);
    });

    it("is bad-answer for a 101 with the wrong accept value or an extension", async () => {
      const wrongAccept = await signalsFor((head) => upgradeAnswer(head, "d3Jvbmc="));
      const extension = await signalsFor((head) =>
        upgradeAnswer(head).replace(
          "\r\n\r\n",
          "\r\nSec-WebSocket-Extensions: permessage-deflate\r\n\r\n",
        ),
      );
      expect([wrongAccept, extension]).toEqual([
        [{ kind: "closed", code: 1006, why: "bad-answer" }],
        [{ kind: "closed", code: 1006, why: "bad-answer" }],
      ]);
    });

    it("is offline when Paperclip closes without an answer or answers nothing in time", async () => {
      expect(await signalsFor(() => "")).toEqual([{ kind: "closed", code: 1006, why: "offline" }]);
      paperclip.answer = () => "hold";
      const { connection, signals } = connectTo(paperclip, { upgradeTimeoutMs: 1 });
      await connection.open();
      expect(signals).toEqual([{ kind: "closed", code: 1006, why: "offline" }]);
    });

    it("sends nothing when the key's guard says signed-out", async () => {
      const signals: LiveSignal[] = [];
      const connection = new LiveEventsConnection({
        address: paperclip.address,
        key: async () => ({ kind: "failed", failure: "signed-out" }),
        company,
        onSignal: (signal) => signals.push(signal),
      });
      await connection.open();
      expect(signals).toEqual([{ kind: "closed", code: 1006, why: "signed-out" }]);
      expect(paperclip.heads).toEqual([]);
    });
  });

  describe("an open connection", () => {
    it("tells its own company's events, cut down, and resync; it skips the rest", async () => {
      paperclip.onOpen = (socket) =>
        socket.write(
          Buffer.concat([
            textFrame({ ...commentAdded, companyId: "c-other" }),
            textFrame({ type: "live.ready" }),
            textFrame(commentAdded),
            textFrame({
              type: "agent.status",
              companyId: company,
              createdAt,
              payload: { log: "x" },
            }),
            textFrame({ type: "live.resync" }),
          ]),
        );
      const { connection, signalsCame } = connectTo(paperclip);
      await connection.open();
      expect(await signalsCame(4)).toEqual([
        { kind: "open" },
        {
          kind: "event",
          event: {
            kind: "activity",
            action: "issue.comment_added",
            entityType: "issue",
            entityId: "t-1",
            createdAt,
          },
        },
        { kind: "event", event: { kind: "other", type: "agent.status", createdAt } },
        { kind: "resync" },
      ]);
      connection.close();
    });

    it("reads frames that came with the upgrade's answer", async () => {
      paperclip.answer = (head) =>
        `${upgradeAnswer(head)}${textFrame({ type: "live.resync" }).toString("latin1")}`;
      const { connection, signalsCame } = connectTo(paperclip);
      await connection.open();
      expect(await signalsCame(2)).toEqual([{ kind: "open" }, { kind: "resync" }]);
      connection.close();
    });

    it("answers a ping with a pong of the same bytes", async () => {
      paperclip.onOpen = (socket) => socket.write(encodeFrame(frameType.ping, Buffer.from("hi")));
      const { connection } = connectTo(paperclip);
      await connection.open();
      const frames = await paperclip.framesSent(3);
      expect(frames[2]).toEqual({ kind: "pong" });
      connection.close();
    });

    it("echoes Paperclip's close code and reports it", async () => {
      paperclip.onOpen = (socket) =>
        socket.write(encodeFrame(frameType.close, Buffer.from([0x03, 0xf5])));
      const { connection, closed } = connectTo(paperclip);
      await connection.open();
      expect(await closed).toEqual({ kind: "closed", code: 1013, why: "closed" });
      expect((await paperclip.framesSent(3))[2]).toEqual({
        kind: "close",
        bytes: Buffer.from([0x03, 0xf5]),
      });
    });

    it("closes on a binary frame, text that isn't JSON, and a frame that breaks the format", async () => {
      const bad = [
        encodeFrame(frameType.binary, Buffer.from("{}")),
        encodeFrame(frameType.text, Buffer.from("not json")),
        encodeFrame(frameType.text, Buffer.from("{}"), Uint8Array.of(1, 2, 3, 4)),
      ];
      const codes = [];
      for (const frame of bad) {
        paperclip.onOpen = (socket) => socket.write(frame);
        const { connection, closed } = connectTo(paperclip);
        await connection.open();
        codes.push(await closed);
      }
      expect(codes).toEqual([
        { kind: "closed", code: 1003, why: "bad-answer" },
        { kind: "closed", code: 1007, why: "bad-answer" },
        { kind: "closed", code: 1002, why: "bad-answer" },
      ]);
    });

    it("reports a dropped or silent socket as closed with 1006", async () => {
      paperclip.onOpen = (socket) => socket.destroy();
      const dropped = connectTo(paperclip);
      await dropped.connection.open();
      paperclip.onOpen = () => {};
      const silent = connectTo(paperclip, { idleTimeoutMs: 1 });
      await silent.connection.open();
      expect([await dropped.closed, await silent.closed]).toEqual([
        { kind: "closed", code: 1006, why: "closed" },
        { kind: "closed", code: 1006, why: "closed" },
      ]);
    });

    it("closes normally when its owner stops it, and says closed once", async () => {
      const { connection, signals, closed } = connectTo(paperclip);
      await connection.open();
      connection.close();
      connection.close();
      expect(await closed).toEqual({ kind: "closed", code: 1000, why: "stopped" });
      expect((await paperclip.framesSent(3))[2]).toEqual({
        kind: "close",
        bytes: Buffer.from([0x03, 0xe8]),
      });
      expect(signals.filter((signal) => signal.kind === "closed")).toHaveLength(1);
    });
  });

  describe("leaves no socket behind", () => {
    /** A server that ignores the client's close and pings every few milliseconds, and says when its socket closed. */
    async function pingingServer(write: (socket: Socket) => void = () => {}) {
      const server = await new FakeEventsServer({ allowHalfOpen: true }).start();
      const socketClosed = new Promise<void>((resolve) => {
        server.onOpen = (socket) => {
          // The client's end makes the next ping fail with EPIPE; that is the point.
          socket.on("error", () => {});
          write(socket);
          const pings = setInterval(
            () => socket.write(encodeFrame(frameType.ping, new Uint8Array(0))),
            5,
          );
          socket.on("close", () => {
            clearInterval(pings);
            resolve();
          });
        };
      });
      return { server, socketClosed };
    }

    it("ends the socket after a normal close, also when Paperclip ignores it and keeps pinging", async () => {
      const { server, socketClosed } = await pingingServer();
      try {
        const { connection, closed } = connectTo(server, { closeGraceMs: 20 });
        await connection.open();
        connection.close();
        expect(await closed).toEqual({ kind: "closed", code: 1000, why: "stopped" });
        await socketClosed;
      } finally {
        await server.stop();
      }
    });

    it("ends the socket at once after a frame too large, without waiting for Paperclip", async () => {
      const { server, socketClosed } = await pingingServer((socket) =>
        socket.write(textHeader(liveFrameMaxBytes + 1)),
      );
      try {
        const { connection, closed } = connectTo(server, { closeGraceMs: 60_000 });
        await connection.open();
        expect(await closed).toEqual({ kind: "closed", code: 1009, why: "too-large" });
        await socketClosed;
      } finally {
        await server.stop();
      }
    });
  });

  describe("its life", () => {
    it("opens once, and a stop before the upgrade ends drops the socket", async () => {
      const { connection, signals } = connectTo(paperclip);
      const opening = connection.open();
      connection.close();
      await opening;
      expect(signals).toEqual([{ kind: "closed", code: 1000, why: "stopped" }]);
      await expect(connection.open()).rejects.toThrow("opens once");
      const keyed = new LiveEventsConnection({
        address: paperclip.address,
        key: testKey,
        company,
        onSignal: () => {},
      });
      await keyed.open();
      keyed.close();
    });
  });
});
