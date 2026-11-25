import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { saveSnapshot } from "../snapshot/store.ts";
import { openPull, snapshot } from "../state-packet/fakes.test-helper.ts";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";
import {
  answerStatePacket,
  registerStatePacket,
  type StatePacketApi,
  statePacketDataKey,
} from "./state-packet-data.ts";

const companyId = "company-1";
const request = { companyId, issueId: "task-41", wakeReason: "issue_monitor_due" };

/** A plugin context with HAL-41, its comments and the given settings; GitHub is never reached. */
async function fakeContext(config: Record<string, unknown>) {
  const { state } = fakeState();
  const { metrics, written } = fakeMetrics();
  const logged: string[] = [];
  type Handler = (params: Record<string, unknown>) => Promise<unknown>;
  const handlers = new Map<string, Handler>();
  const ctx: StatePacketApi = {
    state,
    metrics,
    config: { get: async () => config },
    secrets: { resolve: () => Promise.reject(new Error("no secrets in this test")) },
    http: { fetch: () => Promise.reject(new Error("no GitHub in this test")) },
    data: { register: (key: string, handler: Handler) => handlers.set(key, handler) },
    issues: {
      get: async (issueId: string) => (issueId === "task-41" ? { identifier: "HAL-41" } : null),
      listComments: async () => [
        {
          authorAgentId: "agent-liam",
          createdAt: new Date("2026-11-25T15:50:00Z"),
          body: "Looks good.",
        },
        { authorAgentId: null, createdAt: new Date("2026-11-25T15:55:00Z"), body: "Board: go." },
      ],
    },
    agents: {
      get: async (agentId: string) => (agentId === "agent-liam" ? { name: "Liam" } : null),
    },
    logger: { info: (line: string) => logged.push(line) },
  } as unknown as StatePacketApi;
  // The watcher's snapshot, taken just now, so nothing is read again.
  await saveSnapshot(
    ctx,
    companyId,
    snapshot([openPull(41, "ada/HAL-41-fuel")], new Date().toISOString()),
  );
  return { ctx, written, logged, handlers };
}

verifies("paperclip.state-packet", () => {
  describe("the state-packet data key", () => {
    test("the setting starts off: no packet, logged and counted", async () => {
      const { ctx, written, logged } = await fakeContext({});
      expect(await answerStatePacket(ctx, request)).toEqual({
        packet: null,
        reason: "the statePacket setting is off",
      });
      expect(logged).toEqual(["State packet: none for task-41: the statePacket setting is off"]);
      expect(written).toEqual([{ name: "state_packet.none", value: 1, tags: { companyId } }]);
      const declared = manifest.instanceConfigSchema?.["properties"] as Record<
        string,
        { default?: unknown }
      >;
      expect(declared["statePacket"]?.default).toBe(false);
    });

    test("with the setting on, the packet names the comments' authors and is counted", async () => {
      const { ctx, written, handlers } = await fakeContext({ statePacket: true });
      registerStatePacket(ctx);
      const answer = (await handlers.get(statePacketDataKey)?.(request)) as { packet: string };
      expect(answer.packet).toContain("- acme/rockets#41 open, head f00d000, ci-ok success");
      expect(answer.packet).toContain('- a person, 2026-11-25T15:55:00.000Z: "Board: go."');
      expect(answer.packet).toContain('- Liam, 2026-11-25T15:50:00.000Z: "Looks good."');
      expect(written).toEqual([{ name: "state_packet.built", value: 1, tags: { companyId } }]);
    });

    test("a request without the company, the task or the wake reason gets no packet", async () => {
      const { ctx } = await fakeContext({ statePacket: true });
      expect(await answerStatePacket(ctx, { companyId })).toEqual({
        packet: null,
        reason: "companyId, issueId and wakeReason are required",
      });
    });
  });
});
