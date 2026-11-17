import { request } from "node:http";
import { gatewayMaxMessageBytes } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { gatewayLoopbackHost } from "./gateway-listener.ts";
import {
  clientFrame,
  handshakeRequest,
  op,
  openListener,
  RawClient,
} from "./listener.test-helper.ts";

/** The status line of the answer to a handshake with one thing changed. */
async function statusOf(
  options: Parameters<typeof handshakeRequest>[1],
  extraHosts?: string[],
): Promise<string> {
  const t = await openListener(extraHosts === undefined ? {} : { extraHosts });
  try {
    const client = t.client();
    client.write(handshakeRequest(t.listener.port, options ?? {}).text);
    const text = await client.until((seen) => seen.includes("\r\n"));
    return text.split("\r\n")[0] ?? "";
  } finally {
    await t.stop();
  }
}

verifies("remote-gateway.listener", () => {
  describe("where it listens", () => {
    it("listens on 127.0.0.1 only", async () => {
      const t = await openListener();
      try {
        expect(gatewayLoopbackHost).toBe("127.0.0.1");
        const probe = new RawClient(t.listener.port);
        probe.write(handshakeRequest(t.listener.port).text);
        await probe.until((text) => text.startsWith("HTTP/1.1 101"));
        expect(probe.socket.remoteAddress).toBe("127.0.0.1");
      } finally {
        await t.stop();
      }
    });
  });

  describe("the handshake", () => {
    it("upgrades a request that names the loopback address and port, or localhost", async () => {
      expect(await statusOf({})).toContain("101");
      const t = await openListener();
      try {
        const client = t.client();
        await client.open(t.listener.port, { host: `LocalHost:${t.listener.port}` });
      } finally {
        await t.stop();
      }
    });

    it("refuses another Host with 421, also the right name on another port", async () => {
      expect(await statusOf({ host: "evil.example" })).toContain("421");
      expect(await statusOf({ host: "127.0.0.1:1" })).toContain("421");
      expect(await statusOf({ host: "127.0.0.1" })).toContain("421");
    });

    it("refuses a request with two Host lines with 421, whichever line is ours", async () => {
      expect(await statusOf({ secondHost: "evil.example" })).toContain("421");
      expect(await statusOf({ host: "evil.example", secondHost: "127.0.0.1:1" })).toContain("421");
    });

    it("accepts the name a tunnel gives this computer only when it is listed", async () => {
      expect(await statusOf({ host: "host.example.ts.net" })).toContain("421");
      expect(await statusOf({ host: "Host.Example.TS.net" }, ["host.example.ts.net"])).toContain(
        "101",
      );
      expect(await statusOf({ host: "host.example.ts.net" }, ["Host.Example.TS.net"])).toContain(
        "101",
      );
    });

    it("refuses any request with an Origin with 403, as a web page sends", async () => {
      expect(await statusOf({ origin: "https://evil.example" })).toContain("403");
      expect(await statusOf({ origin: "null" })).toContain("403");
    });

    it("refuses what is not a WebSocket upgrade of GET /v1/gateway in version 13", async () => {
      for (const options of [
        { path: "/" },
        { path: "/v1/health" },
        { method: "POST" },
        { version: "8" },
        { key: "short" },
        { upgrade: false },
      ]) {
        expect(await statusOf(options)).toContain("404");
      }
    });

    it("answers a plain HTTP request with 404 and nothing about what this is", async () => {
      const t = await openListener();
      try {
        const answer = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const call = request(
            { host: "127.0.0.1", port: t.listener.port, path: "/v1/gateway" },
            (response) => {
              let body = "";
              response.on("data", (chunk) => {
                body += chunk;
              });
              response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
            },
          );
          call.on("error", reject);
          call.end();
        });
        expect(answer).toEqual({ status: 404, body: "" });
      } finally {
        await t.stop();
      }
    });
  });

  describe("a connection", () => {
    it("works with Node's own WebSocket client, which is not our code", async () => {
      const t = await openListener();
      try {
        const socket = new WebSocket(`ws://127.0.0.1:${t.listener.port}/v1/gateway`);
        const answer = await new Promise<string>((resolve, reject) => {
          socket.onopen = () =>
            socket.send(JSON.stringify({ type: "hello", id: "h1", version: 1 }));
          socket.onmessage = (event) => resolve(String(event.data));
          socket.onerror = () => reject(new Error("The client could not connect."));
        });
        expect(JSON.parse(answer)).toMatchObject({ type: "welcome", replyTo: "h1" });
        socket.close();
      } finally {
        await t.stop();
      }
    });

    it("carries the protocol: hello, list, watch and events", async () => {
      const t = await openListener();
      try {
        t.source.addSession("s1");
        const client = t.client();
        await client.open(t.listener.port);
        await client.sendJson({ type: "hello", id: "h1", version: 1 });
        await client.sendJson({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
        await client.frames(2);
        t.source.emit("s1", { type: "state", state: "done" });
        const frames = await client.frames(3);
        expect(frames.map((frame) => (frame as { type: string }).type)).toEqual([
          "welcome",
          "ok",
          "event",
        ]);
      } finally {
        await t.stop();
      }
    });

    it("answers a ping with a pong and closes on a close frame", async () => {
      const t = await openListener();
      try {
        const client = t.client();
        await client.open(t.listener.port);
        client.write(clientFrame(op.ping, Buffer.from("abc")));
        await client.until((text) => text.endsWith("\u008a\u0003abc"));
        client.write(clientFrame(op.close, Buffer.alloc(0)));
        await client.ended;
        expect(client.socket.destroyed).toBe(true);
      } finally {
        await t.stop();
      }
    });

    it("works with bytes sent in the same packet as the handshake", async () => {
      const t = await openListener();
      try {
        const client = t.client();
        const handshake = handshakeRequest(t.listener.port);
        const first = clientFrame(
          op.text,
          Buffer.from(JSON.stringify({ type: "hello", id: "h1", version: 1 })),
        );
        client.write(Buffer.concat([Buffer.from(handshake.text), first]));
        expect(await client.frames(1)).toEqual([
          { type: "welcome", replyTo: "h1", version: 1, maxMessageBytes: gatewayMaxMessageBytes },
        ]);
      } finally {
        await t.stop();
      }
    });

    it("sends too-large and closes on a frame that declares more than 64 KiB", async () => {
      const t = await openListener();
      try {
        const client = t.client();
        await client.open(t.listener.port);
        client.write(
          clientFrame(op.text, Buffer.alloc(gatewayMaxMessageBytes + 1, 0x20)).subarray(0, 14),
        );
        expect(await client.frames(1)).toEqual([{ type: "error", code: "too-large" }]);
        await client.ended;
      } finally {
        await t.stop();
      }
    });

    it("sends malformed and closes on a binary frame or a bad message", async () => {
      const t = await openListener();
      try {
        const binary = t.client();
        await binary.open(t.listener.port);
        binary.write(clientFrame(op.binary, Buffer.from("{}")));
        expect(await binary.frames(1)).toEqual([{ type: "error", code: "malformed" }]);
        await binary.ended;
        const bad = t.client();
        await bad.open(t.listener.port);
        bad.write(clientFrame(op.text, Buffer.from('{"type":"run-command","id":"x"}')));
        expect(await bad.frames(1)).toEqual([{ type: "error", code: "malformed" }]);
        await bad.ended;
      } finally {
        await t.stop();
      }
    });

    it("closes a client that breaks the frame format, such as an unmasked frame", async () => {
      const t = await openListener();
      try {
        const client = t.client();
        await client.open(t.listener.port);
        client.write(clientFrame(op.text, Buffer.from("{}"), { mask: false }));
        await client.ended;
        expect(client.textFrames()).toEqual([]);
      } finally {
        await t.stop();
      }
    });

    it("stops the session watches when the client goes away", async () => {
      const t = await openListener();
      try {
        t.source.addSession("s1");
        const client = t.client();
        await client.open(t.listener.port);
        await client.sendJson({ type: "hello", id: "h1", version: 1 });
        await client.sendJson({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
        await client.frames(2);
        expect(t.source.watcherCount("s1")).toBe(1);
        client.end();
        await client.ended;
        for (let turn = 0; turn < 100 && t.source.watcherCount("s1") > 0; turn++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(t.source.watcherCount("s1")).toBe(0);
      } finally {
        await t.stop();
      }
    });

    it("drops a connection that has been silent for 2.5 heartbeats, and pings the rest", async () => {
      const t = await openListener({ heartbeatMs: 20 });
      try {
        const client = t.client();
        await client.open(t.listener.port);
        await client.until((text) => text.includes("\u0089\u0000"));
        await client.ended;
        expect(client.socket.destroyed).toBe(true);
      } finally {
        await t.stop();
      }
    });

    it("drops a connection that answers pings but never says hello", async () => {
      const t = await openListener({ heartbeatMs: 20, helloTimeoutMs: 100 });
      try {
        const client = t.client();
        await client.open(t.listener.port);
        await client.ended;
        expect(client.socket.destroyed).toBe(true);
      } finally {
        await t.stop();
      }
    });

    it("keeps a connection that said hello past the hello time", async () => {
      const t = await openListener({ helloTimeoutMs: 1_000 });
      try {
        const client = t.client();
        await client.open(t.listener.port);
        await client.sendJson({ type: "hello", id: "h1", version: 1 });
        expect(await client.frames(1)).toHaveLength(1);
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        expect(client.socket.destroyed).toBe(false);
      } finally {
        await t.stop();
      }
    });

    it("refuses connections past its limit", async () => {
      const t = await openListener({ maxConnections: 1 });
      try {
        const first = t.client();
        await first.open(t.listener.port);
        const second = t.client();
        second.write(handshakeRequest(t.listener.port).text);
        await second.ended;
        expect(second.received.length).toBe(0);
      } finally {
        await t.stop();
      }
    });
  });

  it("is never started by importing it, only by startGatewayListener", async () => {
    const { startGatewayListener } = await import("./index.ts");
    expect(typeof startGatewayListener).toBe("function");
  });
});
