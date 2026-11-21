import { request } from "node:http";
import { gatewayFrameKinds, gatewayMaxFrameBytes } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TestPhone } from "./e2e-phone.test-helper.ts";
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
        const phone = new TestPhone();
        t.phones.pair(phone.keys.publicKey);
        const socket = new WebSocket(`ws://127.0.0.1:${t.listener.port}/v1/gateway`);
        socket.binaryType = "arraybuffer";
        const answer = await new Promise<unknown>((resolve, reject) => {
          socket.onopen = () => socket.send(phone.resume1(t.phones.host.publicKey));
          socket.onmessage = (event) => {
            const frame = new Uint8Array(event.data as ArrayBuffer);
            if (frame[0] === gatewayFrameKinds.resume2) {
              phone.readResume2(frame);
              socket.send(phone.say({ type: "hello", id: "h1", version: 2 }));
            } else {
              resolve(phone.read(frame));
            }
          };
          socket.onerror = () => reject(new Error("The client could not connect."));
        });
        expect(answer).toMatchObject({ type: "welcome", replyTo: "h1" });
        socket.close();
      } finally {
        await t.stop();
      }
    });

    it("carries the protocol inside the session: hello, list, watch and events", async () => {
      const t = await openListener();
      try {
        t.source.addSession("s1");
        const client = await t.pairedClient();
        await client.sendJson({ type: "hello", id: "h1", version: 2 });
        await client.sendJson({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
        await client.frames(2);
        t.source.emit("s1", { type: "state", state: "done" });
        const frames = await client.frames(3);
        expect(frames.map((frame) => (frame as { type: string }).type)).toEqual([
          "welcome",
          "ok",
          "event",
        ]);
        expect(client.framesOf(op.text)).toEqual([]);
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
        const phone = new TestPhone();
        t.phones.pair(phone.keys.publicKey);
        const handshake = handshakeRequest(t.listener.port);
        const first = clientFrame(op.binary, phone.resume1(t.phones.host.publicKey));
        client.write(Buffer.concat([Buffer.from(handshake.text), first]));
        await client.until(() => client.framesOf(op.binary).length > 0);
        expect(client.framesOf(op.binary)[0]?.[0]).toBe(gatewayFrameKinds.resume2);
        phone.readResume2(client.framesOf(op.binary)[0] ?? Buffer.alloc(0));
      } finally {
        await t.stop();
      }
    });

    it("closes, sending nothing, on a frame that declares more than one Noise message", async () => {
      const t = await openListener();
      try {
        const client = await t.pairedClient();
        client.write(
          clientFrame(op.binary, Buffer.alloc(gatewayMaxFrameBytes + 1)).subarray(0, 14),
        );
        await client.ended;
        expect(client.framesOf(op.binary)).toHaveLength(1);
      } finally {
        await t.stop();
      }
    });

    it("closes, sending nothing, on a text frame, even one holding a valid message", async () => {
      const t = await openListener();
      try {
        const client = t.client();
        await client.open(t.listener.port);
        client.write(clientFrame(op.text, Buffer.from('{"type":"hello","id":"h1","version":2}')));
        await client.ended;
        expect(client.framesOf(op.text)).toEqual([]);
        expect(client.framesOf(op.binary)).toEqual([]);
      } finally {
        await t.stop();
      }
    });

    it("sends malformed, inside the session, and closes on a bad message", async () => {
      const t = await openListener();
      try {
        const client = await t.pairedClient();
        await client.sendJson({ type: "run-command", id: "x" });
        expect(await client.frames(1)).toEqual([{ type: "error", code: "malformed" }]);
        await client.ended;
      } finally {
        await t.stop();
      }
    });

    it("closes a client that breaks the frame format, such as an unmasked frame", async () => {
      const t = await openListener();
      try {
        const client = t.client();
        await client.open(t.listener.port);
        client.write(clientFrame(op.binary, Buffer.from("{}"), { mask: false }));
        await client.ended;
        expect(client.framesOf(op.binary)).toEqual([]);
      } finally {
        await t.stop();
      }
    });

    it("ends only that connection, and reports it, when the phone store throws", async () => {
      const t = await openListener();
      try {
        const connect = t.phones.connected.bind(t.phones);
        t.phones.connected = () => {
          throw new Error("the phone store failed");
        };
        const failing = await t.pairedClient();
        await failing.sendJson({ type: "hello", id: "h1", version: 2 });
        await failing.ended;
        expect(t.errors).toEqual([new Error("the phone store failed")]);
        t.phones.connected = connect;
        const next = await t.pairedClient();
        await next.sendJson({ type: "hello", id: "h1", version: 2 });
        expect(await next.frames(1)).toMatchObject([{ type: "welcome" }]);
      } finally {
        await t.stop();
      }
    });

    it("stops the session watches when the client goes away", async () => {
      const t = await openListener();
      try {
        t.source.addSession("s1");
        const client = await t.pairedClient();
        await client.sendJson({ type: "hello", id: "h1", version: 2 });
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

    it("drops a connection that answers pings but never finishes its handshake", async () => {
      const t = await openListener({ heartbeatMs: 20, handshakeTimeoutMs: 100 });
      try {
        const client = t.client();
        await client.open(t.listener.port);
        await client.ended;
        expect(client.socket.destroyed).toBe(true);
      } finally {
        await t.stop();
      }
    });

    it("reports, and carries on, when the pairing service fails as a pairing times out", async () => {
      const t = await openListener({ handshakeTimeoutMs: 100 });
      try {
        t.pairing.failsToCount = true;
        const client = t.client();
        await client.open(t.listener.port);
        client.write(clientFrame(op.binary, new TestPhone().pair1(t.pairing.code ?? "")));
        await client.ended;
        expect(t.errors).toEqual([new Error("the pairing service failed")]);
        const next = await t.pairedClient();
        await next.sendJson({ type: "hello", id: "h1", version: 2 });
        expect(await next.frames(1)).toMatchObject([{ type: "welcome" }]);
      } finally {
        await t.stop();
      }
    });

    it("drops an open session that never says hello", async () => {
      const t = await openListener({ heartbeatMs: 20, helloTimeoutMs: 100 });
      try {
        const client = await t.pairedClient();
        await client.ended;
        expect(client.socket.destroyed).toBe(true);
      } finally {
        await t.stop();
      }
    });

    it("keeps a connection that said hello past the hello and handshake times", async () => {
      const t = await openListener({ helloTimeoutMs: 1_000, handshakeTimeoutMs: 1_000 });
      try {
        const client = await t.pairedClient();
        await client.sendJson({ type: "hello", id: "h1", version: 2 });
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
