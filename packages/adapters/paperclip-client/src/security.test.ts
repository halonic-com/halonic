import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agentAda,
  chatTask,
  company,
  confirmCard,
  me,
  plainTask,
  testKey,
} from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { buildPath, findRequest, paperclipRequests, UnsafeIdError } from "./requests.ts";

/** Puts `fake` behind a real HTTP server on 127.0.0.1, so the platform's own `fetch` talks to it. */
async function listen(fake: FakePaperclip): Promise<http.Server> {
  const server = http.createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) {
      chunks.push(chunk as Buffer);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (typeof value === "string") {
        headers.set(name, value);
      }
    }
    const body = chunks.length === 0 ? null : Buffer.concat(chunks);
    const request = new Request(`http://127.0.0.1${incoming.url ?? "/"}`, {
      method: incoming.method ?? "GET",
      headers,
      body,
    });
    const answer = await fake.handle(request);
    outgoing.writeHead(answer.status, Object.fromEntries(answer.headers));
    outgoing.end(Buffer.from(await answer.arrayBuffer()));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  fake.address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return server;
}

async function close(server: http.Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

let paperclip: FakePaperclip;
let server: http.Server;

beforeEach(async () => {
  paperclip = new FakePaperclip();
  server = await listen(paperclip);
});

afterEach(async () => {
  await close(server);
});

function client(address = paperclip.address, fetchFunction?: typeof fetch): PaperclipMessaging {
  return new PaperclipMessaging({
    address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    userId: me,
    ...(fetchFunction === undefined ? {} : { fetch: fetchFunction }),
  });
}

/** Every port call, reads and writes, once. */
async function callEverything(messaging: PaperclipMessaging): Promise<void> {
  await messaging.listSources();
  await messaging.listAgents();
  const [chat] = await messaging.listConversations();
  await messaging.listMessages(chat?.id ?? "");
  const items = await messaging.listInboxItems();
  await messaging.listWork();
  await messaging.search("launch");
  for (const item of items) {
    const option = item.options[0]?.id ?? "";
    await messaging.answer(item.id, { kind: "option", option });
  }
  await messaging.send(chat?.id ?? "", "Thanks");
  await messaging.readAttachment(`paperclip:acme:file:${chatTask}:f1`);
  await messaging.refresh();
}

verifies("agent-host.paperclip-key", () => {
  describe("the fixed request list", () => {
    it("matches every request the client makes, and none touches keys", async () => {
      paperclip
        .serveAcme()
        .on("POST", `/api/issues/${plainTask}/interactions/${confirmCard}/accept`, { body: {} })
        .on(
          "POST",
          `/api/issues/${plainTask}/interactions/f0000000-0000-4000-8000-000000000002/respond`,
          { body: {} },
        )
        .on("POST", "/api/approvals/p0000000-0000-4000-8000-000000000001/approve", { body: {} })
        .on("POST", `/api/issues/${chatTask}/comments`, ({ body }) => ({
          body: {
            id: "m3",
            body: (body as { body: string }).body,
            authorUserId: me,
            createdAt: "2026-11-24T10:03:00.000Z",
          },
        }));
      await callEverything(client());
      expect(paperclip.seen.length).toBeGreaterThan(10);
      for (const request of paperclip.seen) {
        expect(
          findRequest(request.method, request.path),
          `${request.method} ${request.path}`,
        ).toBeDefined();
      }
      const paths = Object.values(paperclipRequests).map((request) => request.path);
      expect(paths.filter((path) => path.includes("board-api-keys"))).toEqual([]);
    });

    it("encodes every ID as one path segment and refuses `/`, `..` and empty IDs", () => {
      expect(buildPath("listComments", { task: chatTask })).toBe(
        `/api/issues/${chatTask}/comments`,
      );
      for (const unsafe of ["x/../../agents/y", "..", ".", "", "a\\b", "a%2Fb", "a b"]) {
        expect(() => buildPath("listComments", { task: unsafe })).toThrow(UnsafeIdError);
      }
      expect(() => buildPath("listComments", {})).toThrow(UnsafeIdError);
      expect(findRequest("GET", "/api/issues/x/../comments")).toBeUndefined();
      expect(findRequest("DELETE", `/api/issues/${chatTask}/comments`)).toBeUndefined();
    });

    it("sends nothing for the ID `x/../../agents/y`, raw or hidden in an opaque ID", async () => {
      const messaging = client();
      const answer = { kind: "option", option: "accept" } as const;
      await expect(messaging.answer("x/../../agents/y", answer)).resolves.toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      const hidden = `paperclip:acme:card:${encodeURIComponent("x/../..")}:${encodeURIComponent("agents/y")}`;
      await expect(messaging.answer(hidden, answer)).resolves.toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      const hiddenChat = `paperclip:acme:chat:${encodeURIComponent("x/../../agents/y")}`;
      await expect(messaging.send(hiddenChat, "hi")).resolves.toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(paperclip.seen).toEqual([]);
    });

    it("lists no files and refuses every file read with not-found, sending nothing", async () => {
      paperclip.serveAcme();
      const messaging = client();
      const [chat] = await messaging.listConversations();
      const messages = await messaging.listMessages(chat?.id ?? "");
      const items = await messaging.listInboxItems();
      expect([...messages, ...items].flatMap((each) => each.attachments)).toEqual([]);
      const before = paperclip.seen.length;
      await expect(messaging.readAttachment(`paperclip:acme:file:${chatTask}:f1`)).resolves.toEqual(
        { outcome: "refused", reason: "not-found" },
      );
      expect(paperclip.seen.length).toBe(before);
    });

    it("refuses a message with files whole with unsupported-type, sending nothing", async () => {
      paperclip.serveAcme();
      const screenshot = { name: "Screenshot.png", type: "image/png", bytes: new Uint8Array([1]) };
      await expect(
        client().send(`paperclip:acme:chat:${chatTask}`, "See this", [screenshot]),
      ).resolves.toEqual({ outcome: "refused", reason: "unsupported-type" });
      expect(paperclip.seen).toEqual([]);
    });
  });

  describe("transport", () => {
    it("refuses plain http to another host and allows it to this computer", () => {
      expect(() => client("http://paperclip.acme.test")).toThrow(/plain http/);
      expect(() => client("http://127.0.0.1")).not.toThrow();
      expect(() => client("http://localhost:3100")).not.toThrow();
      expect(() => client("http://[::1]:3100")).not.toThrow();
      expect(() => client("http://[::1]")).not.toThrow();
      expect(() => client("http://127.1")).not.toThrow();
      expect(() => client("https://paperclip.acme.test")).not.toThrow();
      expect(() => client("ftp://paperclip.acme.test")).toThrow(/https/);
      expect(() => client("https://user:pw@paperclip.acme.test")).toThrow(/user name/);
      expect(() => client("https://paperclip.acme.test/api?x=1")).toThrow(/scheme, host and port/);
    });

    it("refuses a key a header can't carry, without showing it", () => {
      const options = { address: paperclip.address, connection: "acme", company, label: "Acme" };
      for (const key of [`${testKey}\r\nx-evil: 1`, `${testKey}\n`, ""]) {
        let message = "";
        try {
          new PaperclipMessaging({ ...options, key });
        } catch (error) {
          message = (error as Error).message;
          expect(error).toMatchObject({ reason: "bad-key" });
        }
        expect(message).not.toBe("");
        expect(message).not.toContain(testKey);
      }
    });

    it("refuses a redirect to the same host", async () => {
      paperclip.on("GET", `/api/companies/${company}/agents`, {
        status: 302,
        headers: { location: `${paperclip.address}/api/companies/${company}/agents-moved` },
      });
      await expect(client().listAgents()).rejects.toMatchObject({ reason: "redirect" });
      expect(paperclip.seen.map((request) => request.path)).toEqual([
        `/api/companies/${company}/agents`,
      ]);
    });

    it("refuses a redirect to another host, which never hears from the client", async () => {
      const other = new FakePaperclip();
      const otherServer = await listen(other);
      try {
        paperclip.on("GET", `/api/companies/${company}/agents`, {
          status: 307,
          headers: { location: `${other.address}/steal` },
        });
        await expect(client().listAgents()).rejects.toMatchObject({ reason: "redirect" });
        expect(other.seen).toEqual([]);
      } finally {
        await close(otherServer);
      }
    });

    it("sends the key only in the Authorization header", async () => {
      paperclip.serveAcme();
      await client().listAgents();
      const [request] = paperclip.seen;
      expect(request?.headers.get("authorization")).toBe(`Bearer ${testKey}`);
      expect(request?.headers.get("cookie")).toBeNull();
      const otherHeaders = Object.entries(request?.headers ?? {}).filter(
        ([name]) => name !== "authorization",
      );
      expect(JSON.stringify(otherHeaders)).not.toContain(testKey);
      expect(`${request?.path}?${request?.query}`).not.toContain(testKey);
    });
  });

  it("keeps the key, request headers and failed answers' bodies out of every error and log line", async () => {
    const leak = `secret-body ${testKey}`;
    paperclip
      .on("GET", `/api/companies/${company}/agents`, { status: 500, body: { error: leak } })
      .on("GET", `/api/companies/${company}/chats`, {
        status: 302,
        headers: { location: "https://evil.test/" },
      })
      .on("GET", `/api/companies/${company}/issues`, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
      .on("GET", `/api/issues/${plainTask}/interactions`, { status: 403, body: { error: leak } });
    const logged: string[] = [];
    const log = (error: unknown) => {
      const { message, stack } = error as Error;
      logged.push(String(error), message, stack ?? "", JSON.stringify(error));
    };
    const messaging = client();
    const card = `paperclip:acme:card:${plainTask}:${confirmCard}`;
    const attempts: (() => Promise<unknown>)[] = [
      () => messaging.listAgents(),
      () => messaging.listConversations(),
      () => messaging.listWork(),
      () => messaging.answer(card, { kind: "option", option: "accept" }),
      () =>
        client(paperclip.address, () =>
          Promise.reject(new Error(`fetch failed ${testKey}`)),
        ).listAgents(),
      async () => client(`http://paperclip.acme.test/${testKey}`),
    ];
    for (const attempt of attempts) {
      await attempt().then(
        () => logged.push("no error"),
        (error: unknown) => log(error),
      );
    }
    expect(logged.filter((line) => line === "no error")).toEqual([]);
    const all = logged.join("\n");
    expect(all).not.toContain(testKey);
    expect(all).not.toContain("secret-body");
    expect(all).not.toMatch(/bearer|authorization/i);
    expect(all).not.toContain(agentAda);
  });
});
