import {
  gatewayFallbackProtocolVersion,
  gatewayMaxMessageBytes,
  gatewayMaxMessagingIdLength,
  type gatewayTeamLists,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayScene } from "../test-support/gateway-scene.ts";
import { parseHostMessage } from "./host-message.ts";
import type { MessagingClient } from "./messaging-client.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** One `team-read` of each `what`, and the `what` its `team-data` answers with. */
const reads: readonly [
  (typeof gatewayTeamLists)[number] | "pull-request",
  (messaging: MessagingClient) => Promise<unknown>,
][] = [
  ["parts", (messaging) => messaging.readTeam("parts")],
  ["seats", (messaging) => messaging.readTeam("seats")],
  ["pull-requests", (messaging) => messaging.readTeam("pull-requests")],
  ["queue", (messaging) => messaging.readTeam("queue")],
  ["spend", (messaging) => messaging.readSpend("month")],
  ["pull-request", (messaging) => messaging.readPullRequest("pr-6162")],
];

/** The id of the one `team-read` the page sent, after checking it sent only that one. */
function onlyId(scene: GatewayScene): string {
  const sent = scene.tunnel.sentOf("team-read");
  expect(sent).toHaveLength(1);
  return sent[0]?.id ?? "";
}

verifies("remote.phone-team-read", () => {
  describe("requests and their answers", () => {
    it.each(reads)(
      "settles a team-read of %s by its team-data, after sending it once",
      async (what, read) => {
        const scene = new GatewayScene();
        scene.connect();
        const outcome = read(scene.client.messaging);
        const replyTo = onlyId(scene);
        expect(scene.tunnel.lastOf("team-read").what).toBe(what);
        scene.host({ type: "team-data", replyTo, what, items: [{ id: "t1" }] });
        const value =
          what === "pull-request" ? { id: "t1" } : { items: [{ id: "t1" }], more: undefined };
        expect(await outcome).toEqual({ kind: "done", value });
        expect(scene.tunnel.ended).toEqual([]);
      },
    );

    it("names the spend's range", () => {
      const scene = new GatewayScene();
      scene.connect();
      void scene.client.messaging.readSpend("week");
      expect(scene.tunnel.lastOf("team-read")).toMatchObject({ what: "spend", range: "week" });
    });

    it.each(["not-found", "offline", "signed-out", "not-supported"] as const)(
      "settles each read refused with %s and keeps the connection",
      async (code) => {
        const scene = new GatewayScene();
        scene.connect();
        for (const [, read] of reads) {
          const outcome = read(scene.client.messaging);
          scene.host({ type: "error", replyTo: scene.tunnel.lastOf("team-read").id, code });
          expect(await outcome).toEqual({ kind: "refused", code });
        }
        expect(scene.tunnel.ended).toEqual([]);
      },
    );

    it("sends no read of a pull request whose id breaks the id rule", async () => {
      const scene = new GatewayScene();
      scene.connect();
      for (const id of ["", "pr 1", "a/b", "x".repeat(gatewayMaxMessagingIdLength + 1)]) {
        expect(await scene.client.messaging.readPullRequest(id)).toEqual({
          kind: "not-sent",
          reason: "invalid",
        });
      }
      expect(scene.tunnel.sentOf("team-read")).toEqual([]);
    });

    it("sends a read of a pull request a provider named with `:` and `%`", () => {
      const scene = new GatewayScene();
      scene.connect();
      const pullRequest = "paperclip:acme:pull:acme%2Fapp:11";
      void scene.client.messaging.readPullRequest(pullRequest);
      expect(scene.tunnel.lastOf("team-read")).toMatchObject({ what: "pull-request", pullRequest });
    });
  });

  describe("what ends the session", () => {
    it("ends it on a team-data of another what, and cuts the read off", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const read = scene.client.messaging.readTeam("queue");
      scene.host({ type: "team-data", replyTo: onlyId(scene), what: "seats", items: [] });
      expect(scene.tunnel.ended).toEqual([1]);
      expect(await read).toEqual({ kind: "cut-off" });
    });

    it("ends it on a pull request's team-data without exactly one item", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const read = scene.client.messaging.readPullRequest("pr-1");
      scene.host({ type: "team-data", replyTo: onlyId(scene), what: "pull-request", items: [] });
      expect(scene.tunnel.ended).toEqual([1]);
      expect(await read).toEqual({ kind: "cut-off" });
    });

    it("ends it on a team-data for nothing the phone asked, or with an extra key", () => {
      const scene = new GatewayScene();
      scene.connect();
      scene.host({ type: "team-data", replyTo: "p-99", what: "queue", items: [] });
      expect(scene.tunnel.ended).toEqual([1]);
      scene.connect();
      void scene.client.messaging.readTeam("queue");
      const replyTo = scene.tunnel.lastOf("team-read").id;
      scene.host(
        JSON.stringify({ type: "team-data", replyTo, what: "queue", items: [], extra: 1 }),
      );
      expect(scene.tunnel.ended).toEqual([1, 2]);
    });

    it("reads a team-data strictly, and none from a version 3 host", () => {
      const page = { type: "team-data", replyTo: "p-3", what: "queue", items: [{ id: "q1" }] };
      expect(parseHostMessage(JSON.stringify({ ...page, more: "40" })).ok).toBe(true);
      for (const wrong of [
        { ...page, items: ["q1"] },
        { ...page, what: "inbox" },
        { ...page, replyTo: undefined },
        { ...page, more: "a:b" },
      ]) {
        expect(parseHostMessage(JSON.stringify(wrong))).toEqual({
          ok: false,
          problem: "malformed",
        });
      }
      const older = parseHostMessage(JSON.stringify(page), gatewayFallbackProtocolVersion);
      expect(older).toEqual({ ok: false, problem: "malformed" });
    });
  });

  describe("drops and older computers", () => {
    it("settles a read cut off by a drop and never sends it again", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const read = scene.client.messaging.readTeam("pull-requests");
      scene.drop();
      expect(await read).toEqual({ kind: "cut-off" });
      scene.connect();
      expect(scene.tunnel.sentOf("team-read")).toHaveLength(1);
    });

    it("sends no team-read while the computer speaks only version 3", async () => {
      const scene = new GatewayScene();
      scene.tunnel.status("connected");
      scene.tunnel.open(1);
      scene.tunnel.host(1, { type: "error", code: "unsupported-version" });
      scene.drop();
      scene.tunnel.status("connected");
      scene.tunnel.open(2);
      scene.tunnel.host(2, {
        type: "welcome",
        replyTo: scene.tunnel.lastOf("hello").id,
        version: gatewayFallbackProtocolVersion,
        maxMessageBytes: gatewayMaxMessageBytes,
      });
      for (const [, read] of reads) {
        expect(await read(scene.client.messaging)).toEqual({ kind: "not-sent", reason: "off" });
      }
      expect(scene.tunnel.sentOf("team-read")).toEqual([]);
    });
  });
});
