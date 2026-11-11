import type { AgentResume } from "@halonicjs/events";
import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import type { CallToolEffect, ModelCallResult } from "../kernel/decide-types.ts";
import { KernelBlobs, KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import { LocalRuns } from "./local-runs.ts";
import { replyStart, TestScheduler } from "./local-runs-test-kit.test-helper.ts";

const resume: AgentResume = {
  messages: [{ role: "user", content: "Reply to support" }],
  calls: [{ id: "m-7", name: "send_mail", arguments: { to: "support" } }],
  step: 1,
};

verifies("engine.connector-call-fields", () => {
  it("hands callTool only the call's own fields, never the prompt or the conversation", async () => {
    const scheduler = new TestScheduler();
    const made: CallToolEffect[] = [];
    const local = new LocalRuns(
      {
        store: new KernelRuns(),
        blobs: new KernelBlobs(),
        scheduler,
        ids: fixedIds(),
        definitionsOf: async () => ({ workflow: replyWorkflow }),
        connectorCalls: {
          location: "/workspaces/acme",
          sending: { checkSending: async () => ({ allowed: true }) },
          reportSettingsError: () => {},
        },
      },
      steppingClock(),
      async (_run, call): Promise<ModelCallResult> =>
        call.resume === undefined
          ? {
              type: "effect",
              connector: "mail",
              tool: "send_mail",
              args: { to: "support" },
              resume,
            }
          : { type: "model", output: "Sent" },
      async (effect) => {
        made.push(effect);
        return { type: "tool", result: "sent", outcome: "ok" };
      },
    );
    scheduler.onTimer = (timer) => local.onTimer(timer);
    await local.start(replyStart);

    await scheduler.runDue();

    expect(made).toHaveLength(1);
    expect(Object.keys(made[0] ?? {}).sort()).toEqual([
      "agent",
      "args",
      "callId",
      "connector",
      "idempotencyKey",
      "state",
      "timeoutMs",
      "tool",
      "type",
    ]);
  });
});
