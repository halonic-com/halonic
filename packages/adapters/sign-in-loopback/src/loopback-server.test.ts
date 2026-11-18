import { request } from "node:http";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import {
  type LoopbackServer,
  type RequestHandler,
  startLoopbackServer,
} from "./loopback-server.ts";

const running: LoopbackServer[] = [];

/** The status of a `GET /` that says it is for `host`; `fetch` can't set that header. */
function statusForHost(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const call = request({ host: "127.0.0.1", port, path: "/", headers: { host } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    call.on("error", reject);
    call.end();
  });
}

async function serve(handler: RequestHandler): Promise<LoopbackServer> {
  const server = await startLoopbackServer(handler);
  running.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

verifies("sign-in-loopback.loopback-server", () => {
  describe("a request to the loopback address", () => {
    it("reaches the handler with its method, path and query, and the answer comes back", async () => {
      const seen: Request[] = [];
      const server = await serve(async (request) => {
        seen.push(request);
        return new Response("hello", { status: 201, headers: { "x-fake": "yes" } });
      });

      const response = await fetch(`http://127.0.0.1:${server.port}/sign-in/abc?code=1&state=2`);

      expect(response.status).toBe(201);
      expect(response.headers.get("x-fake")).toBe("yes");
      expect(await response.text()).toBe("hello");
      const [request] = seen;
      expect(request?.method).toBe("GET");
      const url = new URL(request?.url ?? "");
      expect(url.host).toBe(`127.0.0.1:${server.port}`);
      expect(url.pathname).toBe("/sign-in/abc");
      expect(url.search).toBe("?code=1&state=2");
    });

    it("also answers when the request says localhost", async () => {
      const server = await serve(async () => new Response("ok"));

      const response = await fetch(`http://localhost:${server.port}/`);

      expect(response.status).toBe(200);
    });
  });

  describe("a request that names another host", () => {
    it.each([
      ["another name", (port: number) => `evil.example:${port}`],
      ["another port", (port: number) => `127.0.0.1:${port + 1}`],
      ["no port", () => "127.0.0.1"],
    ])("is refused with a 421 before the handler sees it (%s)", async (_name, host) => {
      let calls = 0;
      const server = await serve(async () => {
        calls += 1;
        return new Response("ok");
      });

      const status = await statusForHost(server.port, host(server.port));

      expect(status).toBe(421);
      expect(calls).toBe(0);
    });
  });

  describe("a handler that throws", () => {
    it("gives an empty 500 that holds nothing of the error", async () => {
      const server = await serve(async () => {
        throw new Error("fake-token-0000000001 was refused");
      });

      const response = await fetch(`http://127.0.0.1:${server.port}/`);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe("");
    });
  });

  describe("closing", () => {
    it("lets an answer in flight finish and stops listening", async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reached: () => void = () => undefined;
      const handlerReached = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const server = await serve(async () => {
        reached();
        await gate;
        return new Response("late");
      });
      const inFlight = fetch(`http://127.0.0.1:${server.port}/`);
      // Closing before the request arrived would cut an idle connection, so wait for the handler.
      await handlerReached;

      const closing = server.close();
      release();

      expect(await (await inFlight).text()).toBe("late");
      await closing;
      await expect(fetch(`http://127.0.0.1:${server.port}/`)).rejects.toThrow();
    });

    it("does nothing the second time", async () => {
      const server = await serve(async () => new Response("ok"));

      await server.close();

      await expect(server.close()).resolves.toBeUndefined();
    });
  });
});
