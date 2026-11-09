import type { OpenHarnessBridge } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type BridgeSettings, openBridge } from "./bridge.ts";
import { fakeRun, send } from "./fakes.test-helper.ts";
import type { BridgeRequestContext, BridgeRoute } from "./route.ts";

/** A route that answers with the body it was sent. */
const echo: BridgeRoute = {
  method: "POST",
  path: "/echo",
  handle: async ({ readBody, response }) => {
    const body = await readBody();
    response.end(body);
  },
};

const settings: BridgeSettings = { limits: { maxBytes: 16, timeoutMs: 5_000 }, routes: [echo] };

const opened: OpenHarnessBridge[] = [];

async function open(routes: readonly BridgeRoute[] = [echo], signal?: AbortSignal) {
  const bridge = await openBridge(fakeRun(signal), { ...settings, routes });
  opened.push(bridge);
  return bridge;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((bridge) => bridge.close()));
});

verifies("harness-bridge.server", () => {
  describe("who it serves", () => {
    it("listens on loopback with a new random token for each run", async () => {
      const first = await open();
      const second = await open();
      expect(new URL(first.url).hostname).toBe("127.0.0.1");
      expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(second.token).not.toBe(first.token);
      expect(second.url).not.toBe(first.url);
    });

    it("answers 401 without the run's token, whatever the path, and never repeats it", async () => {
      const bridge = await open();
      const other = await open();
      for (const token of [undefined, other.token, `${bridge.token}x`]) {
        for (const path of ["/echo", "/nowhere"]) {
          const reply = await send(bridge, path, token === undefined ? {} : { token });
          expect(reply.status).toBe(401);
          expect(reply.text).not.toContain(bridge.token);
          expect(JSON.parse(reply.text)).toMatchObject({ error: { type: "unauthenticated" } });
        }
      }
    });

    it("serves a request with the token, and answers 404 for a path it doesn't serve", async () => {
      const bridge = await open();
      expect(await send(bridge, "/echo?beta=true", { token: bridge.token, body: "hi" })).toEqual({
        status: 200,
        text: "hi",
      });
      expect((await send(bridge, "/nowhere", { token: bridge.token })).status).toBe(404);
      expect((await send(bridge, "/echo", { token: bridge.token, method: "GET" })).status).toBe(
        404,
      );
    });

    it("gives a route that reads the body twice the same body both times", async () => {
      const twice: BridgeRoute = {
        ...echo,
        handle: async ({ readBody, response }) => {
          const first = await readBody();
          const second = await readBody();
          response.end(`${Buffer.from(first)}|${Buffer.from(second)}`);
        },
      };
      const bridge = await open([twice]);
      expect(await send(bridge, "/echo", { token: bridge.token, body: "hi" })).toEqual({
        status: 200,
        text: "hi|hi",
      });
    });
  });

  describe("limits", () => {
    it("refuses a body over the size limit before the route runs", async () => {
      let ran = false;
      const counting: BridgeRoute = {
        ...echo,
        handle: async () => {
          ran = true;
        },
      };
      const bridge = await open([counting]);
      const reply = await send(bridge, "/echo", { token: bridge.token, body: "x".repeat(17) });
      expect(reply.status).toBe(400);
      expect(ran).toBe(false);
    });

    it("stops reading a streamed body at the size limit", async () => {
      const bridge = await open();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let chunk = 0; chunk < 4; chunk += 1) controller.enqueue(new Uint8Array(8));
          controller.close();
        },
      });
      const response = await fetch(`${bridge.url}/echo`, {
        method: "POST",
        headers: { "x-halonic-run-token": bridge.token },
        body,
        duplex: "half",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { type: "invalid_input" } });
    });

    it("answers a route's unknown error with a generic message, never its text", async () => {
      const sent = { token: "" };
      const leaky: BridgeRoute = {
        ...echo,
        handle: async () => {
          throw new Error(`the upstream reply echoed ${sent.token}`);
        },
      };
      const bridge = await open([leaky]);
      sent.token = bridge.token;
      const reply = await send(bridge, "/echo", { token: bridge.token });
      expect(reply.status).toBe(500);
      expect(reply.text).not.toContain(bridge.token);
      expect(JSON.parse(reply.text)).toMatchObject({ error: { type: "internal" } });
    });
  });

  describe("a route that fails after its reply began", () => {
    it("ends the connection instead of sending a second reply", async () => {
      const halfway: BridgeRoute = {
        ...echo,
        handle: async ({ response }) => {
          response.writeHead(200);
          response.write("partial");
          throw new Error("the upstream stream broke");
        },
      };
      const bridge = await open([halfway]);
      await expect(send(bridge, "/echo", { token: bridge.token })).rejects.toThrow();
    });
  });

  describe("closing", () => {
    it("aborts requests in flight, then refuses new ones; closing twice is safe", async () => {
      let started: () => void = () => {};
      const inFlight = new Promise<void>((resolve) => (started = resolve));
      let seen: BridgeRequestContext["signal"] | undefined;
      const hanging: BridgeRoute = {
        ...echo,
        handle: ({ signal }) => {
          seen = signal;
          started();
          return new Promise(() => {});
        },
      };
      const bridge = await open([hanging]);
      const pending = send(bridge, "/echo", { token: bridge.token }).catch((error) => error);
      await inFlight;
      await Promise.all([bridge.close(), bridge.close()]);
      expect(seen?.aborted).toBe(true);
      expect(await pending).toBeInstanceOf(Error);
      await expect(send(bridge, "/echo", { token: bridge.token })).rejects.toThrow();
    });

    it("closes when the run's signal aborts, even before it opened", async () => {
      const run = new AbortController();
      const bridge = await open([echo], run.signal);
      run.abort();
      await bridge.close();
      await expect(send(bridge, "/echo", { token: bridge.token })).rejects.toThrow();

      const early = await open([echo], AbortSignal.abort());
      await expect(send(early, "/echo", { token: early.token })).rejects.toThrow();
    });
  });
});
