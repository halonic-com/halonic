import type { AgentMessaging } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  callMessaging,
  errorCode,
  messagingServer,
  signedIn,
} from "./messaging-client.test-helper.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

verifies("server.messaging-needs-session", () => {
  describe("a session in every mode", () => {
    it("answers 401 to a loopback request with no session on a server with no password", async () => {
      const { server } = messagingServer(unusedPort<AgentMessaging>("messaging"), {
        password: false,
      });

      const read = await callMessaging(server, "GET", "sources");
      const write = await callMessaging(server, "POST", "answer", {
        body: { item: "i-1", answer: { kind: "option", option: "yes" } },
      });
      const changes = await callMessaging(server, "GET", "changes");

      expect([read.status, write.status, changes.status]).toEqual([401, 401, 401]);
      expect(await errorCode(read)).toBe("not_signed_in");
    });

    it("answers 401 to a request with no session on a server with a password", async () => {
      const { server } = messagingServer(unusedPort<AgentMessaging>("messaging"));

      const response = await callMessaging(server, "GET", "sources");

      expect(response.status).toBe(401);
    });

    it("doesn't mount the routes on a many-users server", async () => {
      const host = "deploy.acme.example";
      const server = testServer({
        passwordHash: null,
        secrets: unusedPort("secrets"),
        config: { allowedHosts: [host] },
        messaging: { port: unusedPort("messaging"), focus: { report: () => {} } },
        manyUsers: {
          verifier: new StubSessionVerifier({ "alice-token": personalClaims(ids.alice) }),
          cookieName: "acme-session",
          scopedRuns: () => unusedPort("scoped runs"),
        },
      });

      const response = await server.handle(
        new Request(`http://${host}/api/messaging/sources`, {
          headers: { host, authorization: "Bearer alice-token" },
        }),
      );

      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("not_found");
    });
  });
});

verifies("server.messaging-rate", () => {
  describe("writes per session", () => {
    it("refuses the 31st answer in a minute with 429, and the provider gets 30", async () => {
      const fake = new FakeAgentMessaging();
      const source = fake.addSource({ label: "Paperclip · Acme" });
      const item = fake.addInboxItem(source.id, { question: "Ship it?" });
      const answers = vi.spyOn(fake, "answer");
      const { server, clock } = messagingServer(fake);
      const headers = await signedIn(server);
      const answer = () =>
        callMessaging(server, "POST", "answer", {
          headers,
          body: { item: item.id, answer: { kind: "option", option: "yes" } },
        });

      const statuses: number[] = [];
      for (let count = 0; count < 30; count += 1) statuses.push((await answer()).status);
      const refused = await answer();
      const reachedProvider = answers.mock.calls.length;
      const read = await callMessaging(server, "GET", "sources", { headers });
      clock.advance(60 * 1000);
      const nextMinute = await answer();

      expect(statuses.every((status) => status === 200)).toBe(true);
      expect(refused.status).toBe(429);
      expect(await errorCode(refused)).toBe("too_many_requests");
      expect(refused.headers.get("retry-after")).toBe("60");
      expect(reachedProvider).toBe(30);
      expect(read.status).toBe(200);
      expect(nextMinute.status).toBe(200);
    });
  });
});
