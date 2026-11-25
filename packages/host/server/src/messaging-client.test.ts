import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { ServerAgentMessaging } from "./messaging-client.ts";
import { ServerClientError, type ServerFetch } from "./messaging-client-transport.ts";

const token = "device-token-canary-7c2e";
const address = "https://halonic.acme.example";
const source = {
  id: "src-1",
  provider: "paperclip",
  label: "Paperclip · Acme",
  state: { kind: "online", asOf: "2026-11-25T10:00:00.000Z" },
};

/** A `fetch` that records each request and answers with the next of `answers`. */
function scripted(...answers: (() => Response)[]): { fetch: ServerFetch; sent: Request[] } {
  const sent: Request[] = [];
  return {
    sent,
    fetch: async (request) => {
      sent.push(request);
      const next = answers[Math.min(sent.length, answers.length) - 1];
      if (next === undefined) throw new TypeError("fetch failed");
      return next();
    },
  };
}

function client(fetch: ServerFetch, at = address): ServerAgentMessaging {
  return new ServerAgentMessaging({
    address: at,
    token,
    label: "Acme server",
    fetch,
    now: () => new Date("2026-11-25T12:00:00.000Z"),
  });
}

/** What a thrown error shows anywhere: its text, its fields and its JSON. */
function everythingOf(error: unknown): string {
  return [
    String(error),
    JSON.stringify(error),
    JSON.stringify(Object.entries(error as object)),
  ].join("\n");
}

let listening: http.Server | undefined;

afterEach(async () => {
  listening?.closeAllConnections();
  await new Promise((resolve) => listening?.close(resolve) ?? resolve(undefined));
  listening = undefined;
});

verifies("server.messaging-client", () => {
  describe("where requests go", () => {
    it("refuses a plain-http address off this computer before sending anything", () => {
      const { fetch, sent } = scripted();

      for (const unsafe of [
        "http://halonic.acme.example",
        "http://192.0.2.10:8080",
        "ftp://halonic.acme.example",
        "https://user:pw@halonic.acme.example",
        "https://halonic.acme.example/api",
        "https://halonic.acme.example?next=1",
        "not an address",
      ]) {
        expect(() => client(fetch, unsafe), unsafe).toThrow(ServerClientError);
      }
      expect(sent).toEqual([]);
    });

    it("takes https anywhere and plain http to this computer", () => {
      const { fetch } = scripted();

      for (const safe of [
        address,
        "http://localhost:4100",
        "http://127.0.0.1:4100",
        "http://[::1]:4100",
      ]) {
        expect(() => client(fetch, safe), safe).not.toThrow();
      }
    });

    it("sends the token only in the Authorization header", async () => {
      const { fetch, sent } = scripted(() => Response.json({ items: [source] }));

      await client(fetch).listSources();

      const [request] = sent;
      expect(request?.url).toBe(`${address}/api/messaging/sources`);
      expect(request?.headers.get("authorization")).toBe(`Bearer ${token}`);
      expect(request?.redirect).toBe("manual");
      const elsewhere = [...(request?.headers ?? [])].filter(([name]) => name !== "authorization");
      expect(JSON.stringify(elsewhere)).not.toContain(token);
    });

    it("follows no redirect, same host included, and sends no second request", async () => {
      let requests = 0;
      listening = http.createServer((_incoming, outgoing) => {
        requests += 1;
        outgoing.writeHead(307, { location: "/api/messaging/elsewhere" });
        outgoing.end();
      });
      listening.listen(0, "127.0.0.1");
      await once(listening, "listening");
      const { port } = listening.address() as AddressInfo;
      // The platform's own fetch, so this is the redirect rule `fetch` really applies.
      const real = new ServerAgentMessaging({
        address: `http://127.0.0.1:${port}`,
        token,
        label: "Acme server",
      });

      const failure = await real.listSources().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServerClientError);
      expect((failure as ServerClientError).reason).toBe("redirect");
      expect(requests).toBe(1);
    });
  });

  describe("signed out and offline", () => {
    it("lists the sources it knew as signed out after a 401, and refuses a write as signed out", async () => {
      const unauthorized = () => Response.json({ code: "not_signed_in" }, { status: 401 });
      const { fetch } = scripted(() => Response.json({ items: [source] }), unauthorized);
      const messaging = client(fetch);

      await messaging.listSources();
      const sources = await messaging.listSources();
      const answered = await messaging.answer("item-1", { kind: "option", option: "yes" });

      expect(sources).toEqual([{ ...source, state: { kind: "signed-out" } }]);
      expect(answered).toEqual({ outcome: "refused", reason: "signed-out" });
    });

    it("lists its sources as offline when the server can't be reached, and refuses a write as offline", async () => {
      const down = (): Response => {
        throw new TypeError(`fetch failed for ${address}`);
      };
      const { fetch } = scripted(() => Response.json({ items: [source] }), down);
      const messaging = client(fetch);
      const neverReached = client(scripted(down).fetch);

      await messaging.listSources();
      const sources = await messaging.listSources();
      const sent = await messaging.send("chat-1", "Ship it");

      expect(sources).toEqual([{ ...source, state: { kind: "offline", asOf: source.state.asOf } }]);
      expect(sent).toEqual({ outcome: "refused", reason: "offline" });
      expect(await neverReached.listSources()).toEqual([
        expect.objectContaining({ state: { kind: "offline", asOf: "2026-11-25T12:00:00.000Z" } }),
      ]);
    });
  });

  describe("errors", () => {
    it("never hold the token, a header or the body of an answer", async () => {
      const echo = () =>
        Response.json(
          { code: "internal", message: `refused Bearer ${token}` },
          { status: 500, headers: { "x-echo": token } },
        );
      const failures: unknown[] = [];
      for (const answer of [
        echo,
        () => new Response(`not json ${token}`, { status: 200 }),
        () => new Response(null, { status: 302, headers: { location: `/?t=${token}` } }),
        () => Response.json({ code: "too_many_requests" }, { status: 429 }),
      ]) {
        const { fetch } = scripted(answer);
        failures.push(
          await client(fetch)
            .listAgents()
            .catch((error: unknown) => error),
        );
      }
      failures.push(
        (() => {
          try {
            return new ServerAgentMessaging({ address, token: `${token}\n`, label: "Acme server" });
          } catch (error) {
            return error;
          }
        })(),
      );

      expect(failures.every((failure) => failure instanceof ServerClientError)).toBe(true);
      for (const failure of failures) expect(everythingOf(failure)).not.toContain(token);
    });
  });
});
