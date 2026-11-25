import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { errorCode, signedIn } from "./messaging-client.test-helper.ts";
import type { PaperclipKeyPorts } from "./paperclip-key-api.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import {
  FakeCoordination,
  FakePasswordHasher,
  TestClock,
  testServer,
  unusedPort,
} from "./test-server.ts";

const canaryKey = "pcp_board_canary-key-for-route-tests-only";

/** A sign-in that records each call and answers as the server's would, never with a key. */
function recordingPort(): PaperclipKeyPorts & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    start: async (request) => {
      calls.push(["start", request]);
      return {
        outcome: "started",
        signInId: "sign-in-1",
        phrase: "amber otter quiet lantern",
        approvalUrl: "https://paperclip.acme.test/cli-auth/c1?token=made-up",
        expiresAt: "2026-11-25T10:10:00.000Z",
      };
    },
    poll: async (signInId) => {
      calls.push(["poll", signInId]);
      return {
        status: "connected",
        connection: "halonic",
        address: "https://paperclip.acme.test",
        company: "acme-company",
      };
    },
    cancel: async (signInId) => {
      calls.push(["cancel", signInId]);
      return { status: "cancelled" };
    },
    disconnect: async (connection) => {
      calls.push(["disconnect", connection]);
      return { outcome: "disconnected", revoked: false };
    },
  };
}

function keyServer(port: PaperclipKeyPorts, options: { password?: boolean } = {}) {
  const clock = new TestClock();
  const errors: unknown[] = [];
  const server = testServer({
    passwordHash: options.password === false ? null : "hash:pw",
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    paperclipKeys: port,
    errorLog: { record: (cause) => errors.push(cause) },
    config: { allowedHosts: ["localhost"], maxBodyBytes: 64 * 1024 },
  });
  return { server, errors };
}

function call(
  server: Server,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = "POST",
): Promise<Response> {
  return server.handle(
    new Request(`http://localhost/api/paperclip/${path}`, {
      method,
      headers: { host: "localhost", "content-type": "application/json", ...headers },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

verifies("server.paperclip-sign-in", () => {
  describe("who may call", () => {
    it("answers 401 on loopback with no session, also on a server with no password", async () => {
      const { server } = keyServer(unusedPort("paperclip keys"), { password: false });

      const answers = await Promise.all([
        call(server, "sign-in/start", { address: "https://paperclip.acme.test" }),
        call(server, "sign-in/poll", { signInId: "sign-in-1" }),
        call(server, "sign-in/cancel", { signInId: "sign-in-1" }),
        call(server, "disconnect", { connection: "halonic" }),
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([401, 401, 401, 401]);
      expect(await errorCode(answers[0] as Response)).toBe("not_signed_in");
    });

    it("isn't mounted on a many-users server", async () => {
      const host = "deploy.acme.example";
      const server = testServer({
        passwordHash: null,
        secrets: unusedPort("secrets"),
        config: { allowedHosts: [host] },
        paperclipKeys: unusedPort("paperclip keys"),
        manyUsers: {
          verifier: new StubSessionVerifier({ "alice-token": personalClaims(ids.alice) }),
          cookieName: "acme-session",
          scopedRuns: () => unusedPort("scoped runs"),
        },
      });

      const response = await server.handle(
        new Request(`http://${host}/api/paperclip/disconnect`, {
          method: "POST",
          headers: {
            host,
            authorization: "Bearer alice-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ connection: "halonic" }),
        }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe("signed in", () => {
    it("passes each call to the port and answers what it says, with no key", async () => {
      const port = recordingPort();
      const { server } = keyServer(port);
      const session = await signedIn(server);

      const start = await call(
        server,
        "sign-in/start",
        { address: "https://paperclip.acme.test" },
        session,
      );
      const poll = await call(server, "sign-in/poll", { signInId: "sign-in-1" }, session);
      const cancel = await call(server, "sign-in/cancel", { signInId: "sign-in-1" }, session);
      const disconnect = await call(server, "disconnect", { connection: "halonic" }, session);

      expect(port.calls).toEqual([
        ["start", { address: "https://paperclip.acme.test" }],
        ["poll", "sign-in-1"],
        ["cancel", "sign-in-1"],
        ["disconnect", "halonic"],
      ]);
      expect(await start.json()).toMatchObject({
        outcome: "started",
        phrase: "amber otter quiet lantern",
      });
      expect(await poll.json()).toEqual({
        status: "connected",
        connection: "halonic",
        address: "https://paperclip.acme.test",
        company: "acme-company",
      });
      expect(await cancel.json()).toEqual({ status: "cancelled" });
      expect(await disconnect.json()).toEqual({ outcome: "disconnected", revoked: false });
    });

    it("refuses a body that doesn't fit, a body that isn't JSON and an unknown call, before the port", async () => {
      const { server } = keyServer(unusedPort("paperclip keys"));
      const session = await signedIn(server);

      const badName = await call(server, "disconnect", { connection: "../halonic" }, session);
      const extra = await call(server, "sign-in/poll", { signInId: "s", key: canaryKey }, session);
      const notJson = await call(
        server,
        "disconnect",
        {},
        { ...session, "content-type": "text/plain" },
      );
      const unknown = await call(server, "sign-in/approve", { signInId: "s" }, session);
      const get = await call(server, "disconnect", undefined, session, "GET");

      expect([badName, extra, notJson, unknown, get].map((answer) => answer.status)).toEqual([
        400, 400, 415, 404, 404,
      ]);
    });

    it("answers 502 when the port fails, and logs only the call and the error's name", async () => {
      const failing: PaperclipKeyPorts = {
        ...recordingPort(),
        poll: async () => {
          throw new TypeError(`Paperclip answered with ${canaryKey}`);
        },
      };
      const { server, errors } = keyServer(failing);
      const session = await signedIn(server);

      const response = await call(server, "sign-in/poll", { signInId: "sign-in-1" }, session);

      expect(response.status).toBe(502);
      expect(await errorCode(response)).toBe("paperclip_sign_in_failed");
      expect(String(errors[0])).toBe("Error: Paperclip sign-in failed at sign-in/poll: TypeError");
    });
  });
});
