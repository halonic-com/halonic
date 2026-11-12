import type { SendingSettings } from "@halonicjs/app";
import type { ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import {
  agentsUsing,
  replyStart,
  runsOn,
  type TestScheduler,
} from "./local-runs-test-kit.test-helper.ts";

const sendMail: ConnectorTool = {
  name: "send_mail",
  description: "Sends a mail",
  parameters: { type: "object", properties: { to: { type: "string" } } },
  risk: "send",
};

const sending: SendingSettings = { checkSending: async () => ({ allowed: true }) };
const connectorCalls: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending,
  reportSettingsError: () => {},
};

/** Makes the scheduler fail once to set each of `timerIds`, as a full disk would. */
function failToSetOnce(scheduler: TestScheduler, ...timerIds: string[]): void {
  const failing = new Set(timerIds);
  const schedule = scheduler.schedule.bind(scheduler);
  scheduler.schedule = async (key, timerId, at) => {
    if (failing.delete(timerId)) throw new Error(`the timer ${timerId} couldn't be stored`);
    await schedule(key, timerId, at);
  };
}

/**
 * Makes the store fail its next append of a step once, as a full disk would.
 * A step's append carries the run's snapshot; the events a model call's turn
 * writes while it runs don't, so the call still answers and only its record fails.
 */
function failNextAppend(runs: KernelRuns): void {
  const append = runs.append.bind(runs);
  runs.append = async (runId, expectedSeq, events, options = {}) => {
    if (options.snapshot === undefined) return append(runId, expectedSeq, events, options);
    runs.append = append;
    throw new Error("the log couldn't be written");
  };
}

/** A run of the reply workflow whose agent sends a mail, approved, up to the model call after the OK. */
async function approvedMailRun() {
  const mail = new ScriptedConnector("mail", [sendMail]);
  const engine = runsOn(
    [callAnswer(call("m-1", "send_mail", { to: "support" })), textAnswer("Posted")],
    new KernelRuns(),
    { agents: agentsUsing(["mail"], "writer"), connectors: [mail], connectorCalls },
  );
  await engine.executor.start(replyStart);
  await engine.scheduler.runDue();
  await engine.executor.send("run_1", "approve");
  return { ...engine, mail };
}

verifies("engine.local-runs-durable", () => {
  it("carries out an effect whose timer couldn't be set on the run's resume timer", async () => {
    const { executor, model, runs, scheduler } = runsOn([textAnswer("Dear support")]);
    failToSetOnce(scheduler, "call:call-1");

    await expect(executor.start(replyStart)).rejects.toThrow("call:call-1");
    await scheduler.runDue();

    expect(model.requests).toHaveLength(1);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
  });

  it("carries out the kept effects when the timer whose delivery failed comes again", async () => {
    const { runs, scheduler, mail } = await approvedMailRun();
    failToSetOnce(scheduler, "tool:call-4", "resume");

    await expect(scheduler.deliver("run_1", "call:call-3")).rejects.toThrow("tool:call-4");
    // The scheduler delivers a timer whose delivery failed again.
    await scheduler.deliver("run_1", "call:call-3");
    await scheduler.runDue();

    expect(mail.calls).toEqual([{ name: "send_mail", args: { to: "support" } }]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("records a model call's kept answer, without calling again, when its record failed", async () => {
    const { executor, model, runs, scheduler } = runsOn([
      textAnswer("Dear support"),
      textAnswer("A second answer"),
    ]);
    await executor.start(replyStart);
    failNextAppend(runs);

    await expect(scheduler.deliver("run_1", "call:call-1")).rejects.toThrow("couldn't be written");
    await scheduler.deliver("run_1", "call:call-1");
    await scheduler.runDue();

    expect(model.requests).toHaveLength(1);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
  });

  it("records a connector call's kept result, without calling again, when its record failed", async () => {
    const { runs, scheduler, mail } = await approvedMailRun();
    await scheduler.deliver("run_1", "call:call-3");
    failNextAppend(runs);

    await expect(scheduler.deliver("run_1", "tool:call-4")).rejects.toThrow("couldn't be written");
    await scheduler.deliver("run_1", "tool:call-4");
    await scheduler.runDue();

    expect(mail.calls).toHaveLength(1);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});
