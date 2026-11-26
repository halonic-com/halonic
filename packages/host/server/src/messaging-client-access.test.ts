import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ServerAgentMessaging } from "./messaging-client.ts";
import { ServerClientError, type ServerFetch } from "./messaging-client-transport.ts";

const address = "https://engine.acme.example";
const access = { clientId: "id-canary.access", clientSecret: "secret-canary-4e1a" };

/** A `fetch` that records each request and answers with the next of `answers`, the last one repeating. */
function scripted(...answers: (() => Response)[]) {
  const sent: Request[] = [];
  const fetch: ServerFetch = async (request) => {
    sent.push(request);
    return (answers[Math.min(sent.length, answers.length) - 1] ?? (() => new Response()))();
  };
  return { sent, fetch };
}

const sources = () => new Response(JSON.stringify({ items: [] }));

function client(fetch: ServerFetch, withAccess: typeof access | null = access) {
  return new ServerAgentMessaging({
    address,
    token: "device-token",
    label: "Acme",
    fetch,
    ...(withAccess === null ? {} : { access: withAccess }),
  });
}

verifies("server.messaging-client", () => {
  describe("the Cloudflare Access service token", () => {
    it("goes on every request to the paired origin, the streaming one included", async () => {
      // The stream's request is the last: a redirect there ends the reader, so the test needn't wait.
      const server = scripted(sources, sources, () => new Response(null, { status: 302 }));
      const messaging = client(server.fetch);
      await messaging.listSources();
      await messaging.listAgents();
      await expect(messaging.changes().next()).rejects.toMatchObject({ reason: "redirect" });
      expect(server.sent.map((request) => new URL(request.url).pathname)).toContain(
        "/api/messaging/changes",
      );
      for (const request of server.sent) {
        expect(new URL(request.url).origin).toBe(address);
        expect(request.headers.get("cf-access-client-id")).toBe(access.clientId);
        expect(request.headers.get("cf-access-client-secret")).toBe(access.clientSecret);
        expect(request.headers.get("authorization")).toBe("Bearer device-token");
      }
      expect(server.sent.length).toBeGreaterThanOrEqual(3);
    });

    it("is not sent when none is set", async () => {
      const server = scripted(sources);
      await client(server.fetch, null).listSources();
      const [request] = server.sent;
      expect(request?.headers.has("cf-access-client-id")).toBe(false);
      expect(request?.headers.has("cf-access-client-secret")).toBe(false);
    });

    it("follows no redirect, so it never reaches another origin", async () => {
      const server = scripted(
        () => new Response(null, { status: 302, headers: { location: "https://other.example/" } }),
      );
      const failure = await client(server.fetch)
        .listSources()
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ reason: "redirect" });
      expect(server.sent).toHaveLength(1);
      expect(server.sent[0]?.redirect).toBe("manual");
    });

    it("reads the access check's 403 as its own refusal, with no text of the answer", async () => {
      const server = scripted(
        () => new Response(`<html>${access.clientSecret}</html>`, { status: 403 }),
      );
      const failure = await client(server.fetch)
        .listSources()
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ServerClientError);
      expect((failure as ServerClientError).reason).toBe("access-refused");
      expect(String(failure) + JSON.stringify(failure)).not.toContain(access.clientSecret);
    });

    it("keeps the server's own 403 JSON refusals as they were", async () => {
      const server = scripted(
        () =>
          new Response(JSON.stringify({ code: "forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      );
      const failure = await client(server.fetch)
        .listSources()
        .catch((error: unknown) => error);
      expect((failure as ServerClientError).reason).not.toBe("access-refused");
    });

    it("refuses a value a header can't carry, before it sends anything", () => {
      const server = scripted(sources);
      expect(() => client(server.fetch, { clientId: "id", clientSecret: "a\nb" })).toThrow(
        ServerClientError,
      );
      expect(server.sent).toEqual([]);
    });
  });
});
