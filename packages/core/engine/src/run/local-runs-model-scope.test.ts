import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import type { ModelScope } from "../local-executor-options.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

verifies("engine.model-scope-log", () => {
  it("gives a run's model call the run's log and stop, and keeps what the host writes there", async () => {
    const scopes: (ModelScope | undefined)[] = [];
    const setup = runsOn([textAnswer("Dear support")], new KernelRuns(), {
      onResolveModel: async (_request, scope) => {
        scopes.push(scope);
        await scope?.log?.append({
          type: "key-origin.answered",
          provider: "gateway",
          key: "gateway-key",
          origin: "https://gateway.example.com",
          answer: "allowed",
        });
      },
    });

    await setup.executor.start(replyStart);
    await setup.scheduler.runDue();

    expect(scopes.map((scope) => scope?.stop?.stopped)).toEqual([false]);
    const log: readonly RunEvent[] = setup.runs.logs.get("run_1") ?? [];
    const answered = log.filter((event) => event.type === "key-origin.answered");
    expect(answered).toMatchObject([{ origin: "https://gateway.example.com", answer: "allowed" }]);
    const types = log.map((event) => event.type);
    expect(types.indexOf("key-origin.answered")).toBeLessThan(types.indexOf("llm.request"));
    expect(await setup.runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});
