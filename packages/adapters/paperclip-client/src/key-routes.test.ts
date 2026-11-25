import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, company, testKey } from "./acme-data.test-helper.ts";
import { connect, FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { findRequest, type PaperclipRequestName, paperclipRequests } from "./requests.ts";
import { PaperclipTransport } from "./transport.ts";

// Nothing goes to Paperclip upstream (board, HAL-10, 24 Nov), so the fixed
// request list is the main protection: no route that makes keys gets through,
// not directly, not through a redirect and not on a retry (the client retries nothing).

let paperclip: FakePaperclip;

beforeEach(() => {
  paperclip = new FakePaperclip();
});

verifies("agent-host.paperclip-key", () => {
  describe("routes that make keys", () => {
    // Every route on our server's Paperclip that makes a key or a token (commit c0f1328).
    const keyRoutes: readonly (readonly [string, string])[] = [
      ["POST", "/api/board-api-keys"],
      ["POST", `/api/agents/${agentAda}/keys`],
      ["POST", "/api/cli-auth/challenges"],
      ["POST", `/api/companies/${company}/setup-token-login-sessions`],
      ["POST", `/api/companies/${company}/setup-token-login-sessions/s1/completion`],
      ["POST", "/api/tool-gateway/gateways/g1/tokens"],
      ["POST", "/api/agents/me/connections/c1/token"],
      ["POST", `/api/companies/${company}/smoke-lab/oauth/token`],
      ["POST", "/api/board-claim/t1/claim"],
      ["POST", `/api/companies/${company}/secrets`],
      ["POST", "/api/secrets/s1/rotate"],
      // An agent's own proposal carries the secret's value (HAL-18873).
      ["POST", "/api/agents/me/secret-proposals"],
      ["GET", "/api/agents/me/secret-proposals"],
    ];

    it("are on no entry of the fixed list", () => {
      for (const [method, path] of keyRoutes) {
        expect(findRequest(method, path), `${method} ${path}`).toBeUndefined();
      }
      const paths = Object.values(paperclipRequests).map((request) => request.path);
      // The board's own secret-proposal routes are the one exception: they list and decide
      // proposals and never carry a value (`paperclip-client.board-requests`, HAL-18873).
      const boardProposals =
        /^\/api\/companies\/:company\/secret-proposals(\/:proposal\/(approve|reject))?$/;
      const others = paths.filter((path) => !boardProposals.test(path));
      expect(
        others.filter((path) => /keys|token|secret|challenges|board-claim/.test(path)),
      ).toEqual([]);
      expect(paths.length - others.length).toBe(3);
    });

    it("can't be sent: a request off the list is refused before any request goes out", async () => {
      let fetched = 0;
      const transport = new PaperclipTransport({
        address: paperclip.address,
        key: testKey,
        fetch: () => {
          fetched += 1;
          return Promise.resolve(new Response("{}"));
        },
      });
      const offList = "createBoardKey" as PaperclipRequestName;
      await expect(transport.send(offList, { body: { name: "x" } })).rejects.toMatchObject({
        reason: "refused",
      });
      expect(fetched).toBe(0);
    });

    it("isn't reached through a redirect either", async () => {
      paperclip.on("GET", `/api/companies/${company}/agents`, {
        status: 307,
        headers: { location: `${paperclip.address}/api/board-api-keys` },
      });
      await expect(connect(paperclip, { offline: false }).listAgents()).rejects.toMatchObject({
        reason: "redirect",
      });
      expect(paperclip.seen.map((request) => request.path)).toEqual([
        `/api/companies/${company}/agents`,
      ]);
    });
  });
});
