import type { AgentMessaging, Coordination } from "@halonicjs/ports";
import { agentMessagingContract, FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { ServerAgentMessaging } from "./messaging-client.ts";
import type { ServerFetch } from "./messaging-client-transport.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";
const address = `https://${host}`;
const password = "correct horse";
const clientAddress = "203.0.113.7";

/** An owner-mode server with `port` behind its messaging routes and a password for pairing. */
function ownerServer(port: AgentMessaging): Server {
  const clock = new TestClock();
  return testServer({
    passwordHash: null,
    secrets: { get: async (name) => (name === "serve-password" ? `hash:${password}` : null) },
    clock,
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    passwordHasher: new FakePasswordHasher(),
    messaging: { port, focus: { report: () => {} } },
  });
}

/** The server's own `handle` as the client's `fetch`, as if the request came over the network. */
function inProcess(server: Server): ServerFetch {
  return (request) => {
    request.headers.set("host", host);
    return server.handle(request, { clientAddress });
  };
}

/** Pairs a device the way `halonic serve pair` and the Studio dialog do, and gives its token. */
async function pairedToken(server: Server): Promise<string> {
  async function call(
    path: string,
    body?: object,
    cookie?: string,
  ): Promise<Record<string, unknown>> {
    const headers = new Headers({ host });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (cookie !== undefined) headers.set("cookie", cookie);
    const response = await server.handle(
      new Request(`${address}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { clientAddress },
    );
    // Allow answers with no body.
    return ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  }
  const login = await server.handle(
    new Request(`${address}/api/login`, {
      method: "POST",
      headers: { host, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  );
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const { code } = await call("/api/devices/code", { password }, cookie);
  const { pendingId } = await call("/api/pair", { code, deviceName: "Acme laptop" });
  const { waiting } = (await call("/api/devices", undefined, cookie)) as {
    waiting: { id: string }[];
  };
  await call("/api/devices/allow", { password, requestId: waiting[0]?.id }, cookie);
  const { token } = await call("/api/pair/status", { pendingId });
  return String(token);
}

agentMessagingContract("the server client over the server's routes", async (fake) => {
  const server = ownerServer(fake);
  return new ServerAgentMessaging({
    address,
    token: await pairedToken(server),
    label: "Acme server",
    fetch: inProcess(server),
  });
});

verifies("server.messaging-client", () => {
  describe("a token the server doesn't know", () => {
    it("lists the server as signed out and refuses a send as signed out", async () => {
      const fake = new FakeAgentMessaging();
      const source = fake.addSource({ label: "Paperclip · Acme" });
      const chat = fake.addConversation(fake.addAgent(source.id, { name: "Chief" }).id);
      const server = ownerServer(fake);
      await pairedToken(server);
      const client = new ServerAgentMessaging({
        address,
        token: "unknown-device-token",
        label: "Acme server",
        fetch: inProcess(server),
      });

      const sources = await client.listSources();
      const sent = await client.send(chat.id, "Ship it");

      expect(sources).toEqual([
        {
          id: `halonic-server:${address}`,
          provider: "halonic",
          label: "Acme server",
          state: { kind: "signed-out" },
        },
      ]);
      expect(sent).toEqual({ outcome: "refused", reason: "signed-out" });
    });
  });
});
