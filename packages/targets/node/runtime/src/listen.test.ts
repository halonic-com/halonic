import { type IncomingHttpHeaders, request } from "node:http";
import { connect } from "node:net";
import type { RequestContext, Server } from "@halonicjs/host-server";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Listening,
  listenOnNode,
  NetworkNeedsPasswordError,
  NoNetworkAddressError,
} from "./listen.ts";

const lanInterfaces = {
  eth0: [
    {
      address: "192.168.1.20",
      netmask: "255.255.255.0",
      family: "IPv4" as const,
      mac: "00:00:00:00:00:00",
      internal: false,
      cidr: "192.168.1.20/24",
    },
  ],
};

interface Seen {
  url: string;
  method: string;
  body: string;
  headers: Headers;
  context: RequestContext | undefined;
}

/** A handler that records what it got and answers with two cookies. */
function recordingServer(seen: Seen[]): Server {
  return {
    async handle(request, context) {
      seen.push({
        url: request.url,
        method: request.method,
        body: await request.text(),
        headers: request.headers,
        context,
      });
      const headers = new Headers({ "content-type": "text/plain" });
      headers.append("set-cookie", "a=1");
      headers.append("set-cookie", "b=2");
      return new Response("hello", { status: 201, headers });
    },
  };
}

interface Answer {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function send(
  port: number,
  options: { method?: string; path?: string; headers?: Record<string, string>; body?: string },
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path ?? "/",
        headers: options.headers,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("error", reject);
        incoming.on("end", () =>
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.end(options.body);
  });
}

const open: Listening[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((listening) => listening.close()));
});

async function listen(
  overrides: Partial<Parameters<typeof listenOnNode>[0]> = {},
  seen: Seen[] = [],
) {
  const reported: string[] = [];
  const hostNames: (readonly string[])[] = [];
  const listening = await listenOnNode({
    createServer: (allowedHosts) => {
      hostNames.push(allowedHosts);
      return recordingServer(seen);
    },
    port: 0,
    network: false,
    passwordIsSet: true,
    report: (line) => reported.push(line),
    logError: () => undefined,
    interfaces: lanInterfaces,
    ...overrides,
  });
  open.push(listening);
  return { listening, reported, hostNames };
}

verifies("runtime.listen", () => {
  describe("listenOnNode", () => {
    it("binds to the loopback address only, and says nothing for the phone", async () => {
      const { listening, reported } = await listen();
      expect(listening.host).toBe("127.0.0.1");
      expect(reported).toEqual([]);
    });

    it("refuses the network without a password, before it builds a server or binds", async () => {
      let built = false;
      await expect(
        listenOnNode({
          createServer: () => {
            built = true;
            return recordingServer([]);
          },
          port: 0,
          network: true,
          passwordIsSet: false,
          report: () => undefined,
          logError: () => undefined,
          interfaces: lanInterfaces,
        }),
      ).rejects.toThrow(NetworkNeedsPasswordError);
      expect(built).toBe(false);
    });

    it("says how to set a password when it refuses", () => {
      expect(new NetworkNeedsPasswordError().message).toContain("password");
      expect(new NetworkNeedsPasswordError().message).toContain(
        "halonic secret set serve-password",
      );
    });

    it("refuses the network when the computer has no address", async () => {
      await expect(
        listenOnNode({
          createServer: () => recordingServer([]),
          port: 0,
          network: true,
          passwordIsSet: true,
          report: () => undefined,
          logError: () => undefined,
          interfaces: {},
        }),
      ).rejects.toThrow(NoNetworkAddressError);
    });

    it("binds to every address on the network and reports the exact line for the phone", async () => {
      const { listening, reported, hostNames } = await listen({ network: true });
      expect(listening.host).toBe("0.0.0.0");
      expect(reported).toEqual([`Open on your phone: http://192.168.1.20:${listening.port}`]);
      expect(hostNames).toEqual([
        [`localhost:${listening.port}`, `192.168.1.20:${listening.port}`],
      ]);
    });

    it("hands the request to the handler with the socket's address, never a header's", async () => {
      const seen: Seen[] = [];
      const { listening } = await listen({}, seen);
      const answer = await send(listening.port, {
        method: "POST",
        path: "/api/login?x=1",
        headers: { host: "localhost", "x-forwarded-for": "203.0.113.9" },
        body: '{"password":"pw"}',
      });
      expect(answer).toMatchObject({ status: 201, body: "hello" });
      expect(answer.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ method: "POST", body: '{"password":"pw"}' });
      expect(new URL(seen[0]?.url ?? "").pathname + new URL(seen[0]?.url ?? "").search).toBe(
        "/api/login?x=1",
      );
      expect(seen[0]?.headers.get("host")).toBe("localhost");
      expect(seen[0]?.context?.clientAddress).toMatch(/127\.0\.0\.1$/);
    });

    it("refuses a request target that names its own host", async () => {
      const seen: Seen[] = [];
      const { listening } = await listen({}, seen);
      const status = await new Promise<string>((resolve, reject) => {
        const socket = connect(listening.port, "127.0.0.1", () =>
          socket.write(
            "GET http://evil.example/ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
          ),
        );
        let text = "";
        socket.on("data", (chunk) => {
          text += chunk.toString();
        });
        socket.on("end", () => resolve(text.split("\r\n")[0] ?? ""));
        socket.on("error", reject);
      });
      expect(status).toBe("HTTP/1.1 400 Bad Request");
      expect(seen).toEqual([]);
    });

    it("logs a body that fails partway and keeps serving", async () => {
      const errors: unknown[] = [];
      let failing = true;
      const { listening } = await listen({
        createServer: () => ({
          handle: async () => {
            if (!failing) {
              return new Response("ok");
            }
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode("partial"));
                  setTimeout(() => controller.error(new Error("body broke")), 20);
                },
              }),
            );
          },
        }),
        logError: (error) => errors.push(error),
      });
      await send(listening.port, { headers: { host: "localhost" } }).catch(() => undefined);
      await vi.waitFor(() => expect(errors).toHaveLength(1));
      failing = false;
      const answer = await send(listening.port, { headers: { host: "localhost" } });
      expect(answer).toMatchObject({ status: 200, body: "ok" });
    });

    it("closes the port and rethrows when building the server fails", async () => {
      let port = 0;
      await expect(
        listenOnNode({
          createServer: (allowedHosts) => {
            port = Number(allowedHosts[0]?.split(":")[1]);
            throw new Error("no server");
          },
          port: 0,
          network: false,
          passwordIsSet: true,
          report: () => undefined,
          logError: () => undefined,
        }),
      ).rejects.toThrow("no server");
      await expect(send(port, {})).rejects.toThrow();
    });

    it("answers an empty 500 and logs the cause when the handler throws", async () => {
      const errors: unknown[] = [];
      const { listening } = await listen({
        createServer: () => ({
          handle: async () => {
            throw new Error("secret detail");
          },
        }),
        logError: (error) => errors.push(error),
      });
      const answer = await send(listening.port, { headers: { host: "localhost" } });
      expect(answer).toMatchObject({ status: 500, body: "" });
      expect(errors).toHaveLength(1);
    });
  });
});
