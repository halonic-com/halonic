import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { startPaperclipBoard } from "./paperclip-board.ts";
import { seedNames, seedPaperclip, testPaperclip } from "./test-paperclip.ts";
import { openSession, WebDriverError } from "./webdriver.ts";

type Handler = (request: IncomingMessage, body: string) => { status: number; json: unknown };

interface Recorded {
  readonly method: string;
  readonly url: string;
  readonly body: string;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/** A loopback HTTP server that records each request and answers with `handler`. */
async function fakeServer(handler: Handler): Promise<{ url: string; requests: Recorded[] }> {
  const requests: Recorded[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: request.method ?? "", url: request.url ?? "", body });
    const { status, json } = handler(request, body);
    response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, requests };
}

/** A test Paperclip that answers the seed with ids, and steps 8, 9 and 13's reads. */
function seededPaperclip(request: IncomingMessage): { status: number; json: unknown } {
  const url = request.url ?? "";
  if (url === "/api/approvals/a1") return { status: 200, json: { status: "approved" } };
  if (url === "/api/issues/chat1/comments") return { status: 200, json: [{ body: "hi" }] };
  if (url === "/api/cli-auth/me") {
    const live = request.headers.authorization === "Bearer live";
    return live ? { status: 200, json: { source: "board_key" } } : { status: 401, json: {} };
  }
  const ids: Record<string, string> = {
    "/api/companies": "co1",
    "/api/companies/co1/agents": "ag1",
    "/api/companies/co1/issues": "t1",
    "/api/companies/co1/approvals": "a1",
    "/api/companies/co1/chats/ag1": "chat1",
  };
  return { status: 200, json: { id: ids[url] ?? "other" } };
}

verifies("studio-click-test.steps", () => {
  describe("openSession", () => {
    it("attaches to the app's WebView2 through debuggerAddress and speaks W3C WebDriver", async () => {
      const element = { "element-6066-11e4-a52e-4f735466cecf": "e1" };
      const answers: Record<string, unknown> = {
        "/session": { sessionId: "s1" },
        "/session/s1/element": element,
        "/session/s1/execute/sync": "Halonic Studio",
        "/session/s1/screenshot": "iVBORw==",
        "/session/s1/window/handles": ["main", 7],
        "/session/s1/title": "Home · Acme · Halonic",
        "/session/s1/elements": [element, element],
      };
      const driverServer = await fakeServer((request) => ({
        status: 200,
        json: { value: answers[request.url ?? ""] ?? null },
      }));
      const driver = await openSession(`${driverServer.url}/`, "127.0.0.1:9222");
      await driver.click("//button");
      await driver.type("//input", "http://127.0.0.1:3199");
      expect(await driver.pageText()).toBe("Halonic Studio");
      expect([...(await driver.screenshot()).slice(0, 4)]).toEqual([137, 80, 78, 71]);
      expect(await driver.windowHandles()).toEqual(["main"]);
      expect(await driver.title()).toBe("Home · Acme · Halonic");
      expect(await driver.count("//*[@role='tab']")).toBe(2);
      await driver.switchToWindow("main");
      await driver.close();
      const sent = driverServer.requests.map((request) => `${request.method} ${request.url}`);
      expect(sent).toContain("POST /session/s1/element/e1/click");
      expect(sent).toContain("DELETE /session/s1");
      expect(JSON.parse(driverServer.requests[0]?.body ?? "")).toMatchObject({
        capabilities: {
          alwaysMatch: {
            browserName: "webview2",
            "ms:edgeOptions": { debuggerAddress: "127.0.0.1:9222" },
          },
        },
      });
    });

    it("takes an element by the older ELEMENT key, and shows an answer that has neither", async () => {
      let element: unknown = { ELEMENT: "e2" };
      const driverServer = await fakeServer((request) => ({
        status: 200,
        json: { value: request.url === "/session" ? { sessionId: "s1" } : element },
      }));
      const driver = await openSession(driverServer.url, "127.0.0.1:9222");
      await driver.click("//button");
      const sent = driverServer.requests.map((request) => `${request.method} ${request.url}`);
      expect(sent).toContain("POST /session/s1/element/e2/click");
      element = { other: 1 };
      await expect(driver.click("//button")).rejects.toThrow(
        'the element answer has no id: {"other":1}',
      );
    });

    it("throws the server's W3C error", async () => {
      const driverServer = await fakeServer(() => ({
        status: 500,
        json: { value: { error: "session not created", message: "no WebView2" } },
      }));
      await expect(openSession(driverServer.url, "127.0.0.1:9222")).rejects.toThrow(
        new WebDriverError("session not created", "no WebView2"),
      );
    });
  });

  describe("startPaperclipBoard", () => {
    it("passes Studio's calls through, keeps the challenge and approves it as the board", async () => {
      const paperclip = await fakeServer((request) => {
        if (request.url === "/api/cli-auth/challenges") {
          return {
            status: 201,
            json: { id: "c1", token: "t1", approvalPath: "/cli-auth/c1?token=t1" },
          };
        }
        return { status: 200, json: { approved: true } };
      });
      const board = await startPaperclipBoard(paperclip.url);
      try {
        const created = await fetch(`${board.address}/api/cli-auth/challenges`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: "halonic" }),
        });
        expect(created.status).toBe(201);
        expect(await created.json()).toMatchObject({ id: "c1" });
        await expect(board.approveSignIn(0, async () => undefined)).resolves.toBeUndefined();
        const approve = paperclip.requests.at(-1);
        expect(approve).toEqual({
          method: "POST",
          url: "/api/cli-auth/challenges/c1/approve",
          body: '{"token":"t1"}',
        });
      } finally {
        await board.close();
      }
    });

    it("says so when Studio started no sign-in", async () => {
      const paperclip = await fakeServer(() => ({ status: 200, json: {} }));
      const board = await startPaperclipBoard(paperclip.url);
      try {
        await expect(board.approveSignIn(2_000, async () => undefined)).resolves.toBe(
          "Studio started no sign-in on the test Paperclip.",
        );
      } finally {
        await board.close();
      }
    });

    it("keeps the key Studio sends, for step 13", async () => {
      const paperclip = await fakeServer(() => ({ status: 200, json: [] }));
      const board = await startPaperclipBoard(paperclip.url);
      try {
        expect(board.studioKey()).toBeUndefined();
        await fetch(`${board.address}/api/companies/c1/agents`, {
          headers: { authorization: "Bearer acme-key" },
        });
        expect(board.studioKey()).toBe("acme-key");
      } finally {
        await board.close();
      }
    });
  });
});

verifies("studio-click-test.paperclip-steps", () => {
  describe("seedPaperclip and testPaperclip", () => {
    it("seeds a company, an agent, a task, a card on it and a chat, then reads them back", async () => {
      const paperclip = await fakeServer(seededPaperclip);
      const seeded = await seedPaperclip(`${paperclip.url}/`);
      expect(seeded).toEqual({ companyId: "co1", approvalId: "a1", chatId: "chat1" });
      const sent = paperclip.requests.map((request) => `${request.method} ${request.url}`);
      expect(sent[0]).toBe("PATCH /api/instance/settings/experimental");
      const approval = paperclip.requests.find((request) => request.url.endsWith("/approvals"));
      expect(JSON.parse(approval?.body ?? "")).toMatchObject({
        payload: { title: seedNames.card },
        issueIds: ["t1"],
      });
      let key: string | undefined;
      const checks = testPaperclip(paperclip.url, seeded, () => key);
      await expect(checks.approvalStatus()).resolves.toBe("approved");
      await expect(checks.chatComments()).resolves.toEqual(["hi"]);
      await expect(checks.studioKeyWorks()).resolves.toBeUndefined();
      key = "live";
      await expect(checks.studioKeyWorks()).resolves.toBe(true);
      key = "revoked";
      await expect(checks.studioKeyWorks()).resolves.toBe(false);
    });

    it("stops the seed at the first call Paperclip refuses", async () => {
      const paperclip = await fakeServer(() => ({ status: 404, json: { error: "disabled" } }));
      await expect(seedPaperclip(paperclip.url)).rejects.toThrow(
        'PATCH /api/instance/settings/experimental: HTTP 404 {"error":"disabled"}',
      );
    });
  });
});
