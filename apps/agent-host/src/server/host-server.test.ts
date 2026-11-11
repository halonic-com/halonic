import { request } from "node:http";
import { connect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { healthRoute } from "./health-route.ts";
import { type HostRoute, type HostServer, startHostServer } from "./host-server.ts";
import { bearerMatches, randomLaunchToken } from "./launch-token.ts";
import { startNdjsonStream } from "./ndjson-stream.ts";

const token = randomLaunchToken();
let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/** Sends a request with exactly these headers; `fetch` can't set `Host`. */
function send(url: string, path: string, headers: Record<string, string>): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const sent = request(`${url}${path}`, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
        }),
      );
    });
    sent.on("error", reject);
    sent.end();
  });
}

async function started(): Promise<{ url: string; host: string }> {
  server = await startHostServer(token, [healthRoute("1.2.3")]);
  return { url: server.url, host: new URL(server.url).host };
}

describe("startHostServer", () => {
  it("listens on 127.0.0.1 only", async () => {
    const { url } = await started();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("answers a request with the token and its own host", async () => {
    const { url, host } = await started();
    const answer = await send(url, "/v1/health", { host, authorization: `Bearer ${token}` });
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true, version: "1.2.3" });
    expect(answer.headers["cache-control"]).toBe("no-store");
  });

  it("accepts localhost as the host name too", async () => {
    const { url, host } = await started();
    const port = host.split(":")[1] ?? "";
    const headers = { host: `localhost:${port}`, authorization: `Bearer ${token}` };
    expect((await send(url, "/v1/health", headers)).status).toBe(200);
  });

  it("refuses a request without the token, whatever the path", async () => {
    const { url, host } = await started();
    for (const path of ["/v1/health", "/v1/unknown"]) {
      const answer = await send(url, path, { host });
      expect(answer.status).toBe(401);
      expect(answer.headers["www-authenticate"]).toBe("Bearer");
      expect(answer.body).toMatchObject({ error: { kind: "unauthenticated" } });
    }
  });

  it("refuses a wrong token", async () => {
    const { url, host } = await started();
    const headers = { host, authorization: `Bearer ${randomLaunchToken()}` };
    expect((await send(url, "/v1/health", headers)).status).toBe(401);
  });

  it("refuses another host name, as a rebound web page would send", async () => {
    const { url, host } = await started();
    const port = host.split(":")[1] ?? "";
    const headers = { host: `attacker.example:${port}`, authorization: `Bearer ${token}` };
    const answer = await send(url, "/v1/health", headers);
    expect(answer.status).toBe(421);
    expect(answer.body).toMatchObject({ error: { kind: "wrong_host" } });
  });

  it("refuses a request from a web page", async () => {
    const { url, host } = await started();
    const headers = { host, origin: "https://example.com", authorization: `Bearer ${token}` };
    const answer = await send(url, "/v1/health", headers);
    expect(answer.status).toBe(403);
    expect(answer.body).toMatchObject({ error: { kind: "browser_origin" } });
  });

  it("says a path it doesn't serve isn't found, once the request is let in", async () => {
    const { url, host } = await started();
    const answer = await send(url, "/v1/unknown?x=1", { host, authorization: `Bearer ${token}` });
    expect(answer.status).toBe(404);
  });

  it("answers 500 when a route rejects before it answers", async () => {
    server = await startHostServer(token, [
      { method: "GET", path: "/v1/broken", handle: () => Promise.reject(new Error("broken")) },
    ]);
    const headers = { host: new URL(server.url).host, authorization: `Bearer ${token}` };
    const answer = await send(server.url, "/v1/broken", headers);
    expect(answer.status).toBe(500);
    expect(answer.body).toEqual({ error: { kind: "internal" } });
  });

  it("answers 500 and keeps serving when a route throws synchronously", async () => {
    server = await startHostServer(token, [
      healthRoute("1.2.3"),
      {
        method: "GET",
        path: "/v1/broken",
        handle: () => {
          throw new Error("broken");
        },
      },
    ]);
    const headers = { host: new URL(server.url).host, authorization: `Bearer ${token}` };
    const answer = await send(server.url, "/v1/broken", headers);
    expect(answer.status).toBe(500);
    expect(answer.body).toEqual({ error: { kind: "internal" } });
    expect((await send(server.url, "/v1/health", headers)).status).toBe(200);
  });
});

describe("startHostServer, with a caller that holds connections open", () => {
  const limits = {
    headersTimeoutMs: 200,
    requestTimeoutMs: 400,
    checkEveryMs: 50,
    maxConnections: 3,
  };

  /** A route whose answer streams one line after `delayMs`, then ends. */
  function slowStream(delayMs: number): HostRoute {
    return {
      method: "GET",
      path: "/v1/slow",
      handle: async (_request, response) => {
        const stream = startNdjsonStream(response);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        stream.send({ late: true });
        stream.end();
      },
    };
  }

  /** A route that reads the whole body before it answers. */
  const readsBody: HostRoute = {
    method: "POST",
    path: "/v1/read",
    handle: async (request, response) => {
      for await (const _chunk of request) {
        // Only waiting for the end of the body.
      }
      response.end();
    },
  };

  async function startedWithLimits(): Promise<{ port: number; host: string }> {
    const routes = [healthRoute("1.2.3"), slowStream(1_000), readsBody];
    server = await startHostServer(token, routes, limits);
    const host = new URL(server.url).host;
    return { port: Number(host.split(":")[1]), host };
  }

  /** Opens a connection, writes `raw`, and resolves with all it got once the host hangs up. */
  function hungUp(port: number, raw: string): Promise<{ answer: string; afterMs: number }> {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = connect(port, "127.0.0.1", () => socket.write(raw));
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("error", reject);
      socket.on("close", () =>
        resolve({
          answer: Buffer.concat(chunks).toString("utf8"),
          afterMs: Date.now() - startedAt,
        }),
      );
    });
  }

  it("hangs up on a caller that doesn't finish its headers in time", async () => {
    const { port } = await startedWithLimits();
    const { answer, afterMs } = await hungUp(port, "GET /v1/health HTTP/1.1\r\n");
    expect(answer).toMatch(/^HTTP\/1\.1 408/);
    expect(afterMs).toBeLessThan(5_000);
  });

  it("hangs up on a caller that doesn't finish its body in time", async () => {
    const { port, host } = await startedWithLimits();
    const raw = [
      "POST /v1/read HTTP/1.1",
      `Host: ${host}`,
      `Authorization: Bearer ${token}`,
      "Content-Length: 100",
      "",
      "{",
    ].join("\r\n");
    const { answer, afterMs } = await hungUp(port, raw);
    expect(answer).toMatch(/^HTTP\/1\.1 408/);
    expect(afterMs).toBeLessThan(5_000);
  });

  it("keeps a streamed answer open past the request's time limit", async () => {
    const { port, host } = await startedWithLimits();
    const raw = [
      "GET /v1/slow HTTP/1.1",
      `Host: ${host}`,
      `Authorization: Bearer ${token}`,
      "Connection: close",
      "",
      "",
    ].join("\r\n");
    const { answer } = await hungUp(port, raw);
    expect(answer).toMatch(/^HTTP\/1\.1 200/);
    expect(answer).toContain('{"late":true}');
  });

  it("takes no more connections than its cap", async () => {
    const { port } = await startedWithLimits();
    const held: Socket[] = [];
    try {
      for (let index = 0; index < limits.maxConnections; index++) {
        held.push(
          await new Promise<Socket>((resolve) => {
            const socket = connect(port, "127.0.0.1", () => resolve(socket));
          }),
        );
      }
      // Give the server time to count the held connections before the next one.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const { answer } = await hungUp(port, "GET /v1/health HTTP/1.1\r\n\r\n");
      expect(answer).toBe("");
    } finally {
      for (const socket of held) socket.destroy();
    }
  });
});

describe("launch token", () => {
  it("is 32 random bytes in base64url, new each time", () => {
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomLaunchToken()).not.toBe(token);
  });

  it("matches only the exact bearer header", () => {
    expect(bearerMatches(`Bearer ${token}`, token)).toBe(true);
    expect(bearerMatches(token, token)).toBe(false);
    expect(bearerMatches(`bearer ${token}`, token)).toBe(false);
    expect(bearerMatches(undefined, token)).toBe(false);
  });
});
