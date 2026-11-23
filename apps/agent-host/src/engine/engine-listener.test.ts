import { type ClientRequest, type IncomingMessage, request } from "node:http";
import {
  createEngineServer,
  type EngineServerPorts,
  type RunUpdates,
} from "@halonicjs/host-server";
import { launchTokenRefusalContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { defaultHostServerLimits, type HostServerLimits } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { type EngineListener, listenForEngine, maxRunUpdateStreams } from "./engine-listener.ts";

/** A feed the test drives: it counts its followers and says when one leaves. */
class TestFeed implements RunUpdates {
  readonly following = new Set<
    (update: { runId: string; status: "running"; seq: number }) => void
  >();
  #left: Array<() => void> = [];

  follow(listener: (update: { runId: string; status: "running"; seq: number }) => void) {
    this.following.add(listener);
    return () => {
      this.following.delete(listener);
      for (const left of this.#left.splice(0)) left();
    };
  }

  /** Settles when the next follower leaves. */
  nextLeft(): Promise<void> {
    return new Promise((resolve) => this.#left.push(resolve));
  }
}

/** The engine server's ports, with only the run-updates feed and the error log doing anything. */
function testPorts(feed: RunUpdates, logged: unknown[] = []): EngineServerPorts {
  const unused = {} as never;
  return {
    runs: unused,
    runStore: unused,
    trust: unused,
    clock: unused,
    modelSettings: unused,
    routines: { list: async () => [], timeZone: "UTC" },
    errorLog: { record: (error) => logged.push(error) },
    runUpdates: feed,
  };
}

interface Started {
  readonly listener: EngineListener;
  readonly token: string;
  readonly port: number;
  readonly feed: TestFeed;
}

const open: EngineListener[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((listener) => listener.close()));
});

async function start(
  options: { limits?: HostServerLimits; maxStreams?: number } = {},
): Promise<Started> {
  const token = randomLaunchToken();
  const feed = new TestFeed();
  const listener = await listenForEngine(
    (port, maxBodyBytes) =>
      createEngineServer({ launchToken: token, port, maxBodyBytes, ports: testPorts(feed) }),
    { reportError: () => undefined, ...options },
  );
  open.push(listener);
  return { listener, token, port: Number(new URL(listener.url).port), feed };
}

/** Sends a request with exactly these headers (`fetch` can't set `Host`) on its own connection. */
function send(
  url: string,
  method: string,
  headers: Record<string, string>,
  path?: string,
): { sent: ClientRequest; response: Promise<IncomingMessage> } {
  let sent: ClientRequest | undefined;
  const response = new Promise<IncomingMessage>((resolve, reject) => {
    const options = { method, headers, setHost: false, agent: false, ...(path ? { path } : {}) };
    sent = request(url, options, resolve);
    sent.on("error", reject);
    sent.end();
  });
  if (sent === undefined) throw new Error("The request didn't start.");
  return { sent, response };
}

async function statusOf(
  url: string,
  method: string,
  headers: Record<string, string>,
  path?: string,
) {
  const response = await send(url, method, headers, path).response;
  response.resume();
  await new Promise((resolve) => response.on("end", resolve));
  return response.statusCode ?? 0;
}

/** Opens a run-update stream with the token and answers its response, left open. */
function openStream(started: Started) {
  return send(`${started.listener.url}/api/run-updates`, "GET", {
    host: `127.0.0.1:${started.port}`,
    authorization: `Bearer ${started.token}`,
  });
}

// The shared contract proves `contracts.launch-token-refusal`, here over a real socket.
launchTokenRefusalContract("the engine role's listener, over a socket", {
  async start() {
    const started = await start();
    return {
      token: started.token,
      port: started.port,
      servedPath: "/api/hello",
      send: ({ method, path, headers }) =>
        statusOf(`${started.listener.url}${path}`, method, headers),
      close: () => started.listener.close(),
    };
  },
});

verifies("agent-host.engine-listener", () => {
  describe("listenForEngine", () => {
    it("listens on 127.0.0.1 only, on a port the system picks", async () => {
      const { listener, port } = await start();
      expect(listener.url).toBe(`http://127.0.0.1:${port}`);
      expect(port).toBeGreaterThan(0);
    });

    it("refuses a body over 1 MiB with 413", async () => {
      const started = await start();
      const body = "x".repeat(1024 * 1024 + 1);
      const status = await new Promise<number>((resolve, reject) => {
        const sent = request(
          `${started.listener.url}/api/runs`,
          {
            method: "POST",
            setHost: false,
            agent: false,
            headers: {
              host: `127.0.0.1:${started.port}`,
              authorization: `Bearer ${started.token}`,
              "content-type": "application/json",
            },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
          },
        );
        // The listener may answer and close before the whole body is sent.
        sent.on("error", reject);
        sent.end(body);
      });
      expect(status).toBe(413);
    });

    it("refuses an absolute-form target with 400", async () => {
      const started = await start();
      const status = await statusOf(
        `${started.listener.url}/api/hello`,
        "GET",
        {
          host: `127.0.0.1:${started.port}`,
          authorization: `Bearer ${started.token}`,
        },
        "http://acme.test/api/hello",
      );
      expect(status).toBe(400);
    });

    it("refuses a method a Web request can't carry with 405, not 500", async () => {
      const started = await start();
      const status = await statusOf(`${started.listener.url}/api/hello`, "TRACE", {
        host: `127.0.0.1:${started.port}`,
      });
      expect(status).toBe(405);
    });

    it("drops a connection past its connection cap", async () => {
      const started = await start({ limits: { ...defaultHostServerLimits, maxConnections: 1 } });
      const first = openStream(started);
      expect((await first.response).statusCode).toBe(200);
      await expect(statusOf(`${started.listener.url}/api/hello`, "GET", {})).rejects.toThrow();
      first.sent.destroy();
    });
  });
});

verifies("agent-host.engine-run-updates-cap", () => {
  describe("the cap on run-update streams", () => {
    it("refuses a new stream past the cap with 503 and keeps every open one", async () => {
      const started = await start();
      const streams = Array.from({ length: maxRunUpdateStreams }, () => openStream(started));
      for (const stream of streams) expect((await stream.response).statusCode).toBe(200);

      const refused = await openStream(started).response;
      expect(refused.statusCode).toBe(503);
      const body = await textOf(refused);
      expect(JSON.parse(body)).toMatchObject({ code: "too_many_streams" });

      // The open streams still follow the feed, and still get its frames.
      expect(started.feed.following.size).toBe(maxRunUpdateStreams);
      const firstChunk = nextChunk(await streams[0]?.response);
      for (const listener of started.feed.following) {
        listener({ runId: "run_acme", status: "running", seq: 3 });
      }
      expect(await firstChunk).toContain('"runId":"run_acme"');
      for (const stream of streams) stream.sent.destroy();
    });

    it("gives a closed stream's place to a new one", async () => {
      const started = await start({ maxStreams: 1 });
      const first = openStream(started);
      expect((await first.response).statusCode).toBe(200);
      expect((await openStream(started).response).statusCode).toBe(503);

      const left = started.feed.nextLeft();
      first.sent.destroy();
      await left;
      const second = openStream(started);
      expect((await second.response).statusCode).toBe(200);
      second.sent.destroy();
    });

    it("counts no refused request against the cap", async () => {
      const started = await start({ maxStreams: 1 });
      const host = `127.0.0.1:${started.port}`;
      expect(await statusOf(`${started.listener.url}/api/run-updates`, "GET", { host })).toBe(401);
      const stream = openStream(started);
      expect((await stream.response).statusCode).toBe(200);
      stream.sent.destroy();
    });
  });
});

function textOf(response: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      text += chunk;
    });
    response.on("end", () => resolve(text));
  });
}

function nextChunk(response: IncomingMessage | undefined): Promise<string> {
  return new Promise((resolve) =>
    response?.once("data", (chunk: Buffer) => resolve(String(chunk))),
  );
}
