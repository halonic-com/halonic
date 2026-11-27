import { GatewayConnection } from "@halonicjs/adapter-remote-gateway";
import {
  type AgentMessaging,
  gatewayProtocolVersion,
  type MessageReactions,
  type PhoneMessaging,
  type TeamStatus,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import {
  acme,
  type Desktop,
  startDesktop,
  testKey,
} from "../messaging/desktop-messaging.test-helper.ts";
import { phoneMessaging } from "./phone-messaging.ts";

const encoder = new TextEncoder();
const canary = "canary-7f3e-never-on-a-phone";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** A hub whose every member records its name and gives nothing. */
function recordingHub() {
  const calls: unknown[][] = [];
  const member =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return Promise.resolve([]);
    };
  const hub = new Proxy({}, { get: (_target, name) => member(String(name)) });
  return {
    calls,
    messaging: hub as AgentMessaging,
    team: hub as TeamStatus,
    reactions: hub as MessageReactions,
  };
}

/**
 * Runs `message` after `hello` on a fresh gateway connection over `view`, and
 * gives every frame the gateway sent. A fresh one each time, so a message the
 * provider can't serve (which closes the connection) stops no other.
 */
async function bytesSentFor(view: PhoneMessaging, message: { id: string }): Promise<string[]> {
  const sent: string[] = [];
  // The reply comes after the provider, its cache and the fake Paperclip answer over real I/O, so no
  // fixed number of turns is enough (HAL-19054): the transport settles this when the reply or the close arrives.
  let settle = () => {};
  const answeredOrClosed = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const connection = new GatewayConnection({
    source: {
      list: () => [],
      watch: () => ({ kind: "unknown-session" }),
      approvalRisk: () => undefined,
      answerApproval: async () => undefined,
      sendPrompt: async () => undefined,
    },
    policy: { allowRiskyRemotely: () => true },
    transport: {
      send: (json) => {
        sent.push(json);
        if (json.includes(`"replyTo":"${message.id}"`)) settle();
      },
      bufferedBytes: () => 0,
      close: settle,
    },
    messaging: { view, rateLimit: { take: () => true } },
  });
  for (const frame of [{ type: "hello", id: "h1", version: gatewayProtocolVersion }, message]) {
    connection.receive({ binary: false, bytes: encoder.encode(JSON.stringify(frame)) });
  }
  await answeredOrClosed;
  connection.close();
  return sent;
}

verifies("agent-host.gateway-phone-messaging", () => {
  describe("phoneMessaging", () => {
    it("forwards only the view's members, with no files and only `to` of the options", async () => {
      const { calls, messaging, team, reactions } = recordingHub();
      const view = phoneMessaging(messaging, team, reactions);
      const file = { name: "a.png", type: "image/png", bytes: new Uint8Array(1) };
      const options = { to: ["agent-bo"], silent: true } as { to: string[] };
      await view.send("conv-1", "Go", [file], options);
      await view.team.spend("week");
      await view.reactions?.react("msg-1", "👍", true);
      expect(calls).toEqual([
        ["send", "conv-1", "Go", undefined, { to: ["agent-bo"] }],
        ["spend", "week"],
        ["react", "msg-1", "👍", true],
      ]);
      expect(Object.keys(view).sort()).toEqual(
        [
          "answer",
          "changes",
          "listAgents",
          "listConversations",
          "listInboxItems",
          "listMessages",
          "listSources",
          "listWork",
          "reactions",
          "search",
          "send",
          "team",
        ].sort(),
      );
    });
  });

  describe("the key never reaches a phone (P5)", () => {
    it("sends no byte holding the key or a canary during a session over every allowed message", async () => {
      desktop = await startDesktop();
      desktop.paperclip.canary = canary;
      await desktop.paperclipKey.handOver({
        workspace: desktop.workspace,
        connection: "halonic",
        key: testKey,
        ...acme,
      });
      const workspace = await desktop.messaging.of(desktop.workspace);
      if (workspace === undefined) throw new Error("The workspace has no messaging.");
      await desktop.wait(30_000);
      const view = phoneMessaging(workspace.messaging, workspace.team, workspace.reactions);
      const conversation = (await view.listConversations())[0]?.id ?? "none";
      const script = [
        ...["sources", "agents", "conversations", "inbox", "work"].map((what) => ({
          type: "msg-read",
          id: `r-${what}`,
          what,
        })),
        { type: "msg-read", id: "r-messages", what: "messages", conversation },
        { type: "msg-search", id: "s1", text: "Ada" },
        {
          type: "msg-answer",
          id: "a1",
          item: "item-1",
          answer: { kind: "reply", text: "Yes" },
          confirmed: true,
        },
        { type: "msg-send", id: "m1", conversation, body: "Go on" },
        { type: "msg-read", id: "r-reactions", what: "reactions", conversation },
        { type: "msg-watch", id: "w1" },
        ...["parts", "seats", "pull-requests", "queue"].map((what) => ({
          type: "team-read",
          id: `t-${what}`,
          what,
        })),
        { type: "team-read", id: "t-spend", what: "spend", range: "month" },
        { type: "team-read", id: "t-pr", what: "pull-request", pullRequest: "pr-1" },
      ];
      const sent: string[] = [];
      for (const message of script) sent.push(...(await bytesSentFor(view, message)));

      // The session was real: the key went to Paperclip, its answers carried the canary, and the phone got data.
      expect(
        desktop.paperclip.seen.some((seen) => seen.authorization === `Bearer ${testKey}`),
      ).toBe(true);
      expect(sent.some((json) => json.includes('"msg-data"') && json.includes("Ada"))).toBe(true);
      for (const json of sent) {
        expect(json).not.toContain(testKey);
        expect(json).not.toContain(canary);
      }
    });
  });
});
