import type { RunEvent } from "@halonicjs/events";
import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Budget } from "../budget/budget.ts";
import { putSpentRun } from "../budget/budget-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import type { MeterAnswer, MeterCheckKind, MeterPrincipal, PlanStop } from "../meter/meter.ts";
import { NoMeter } from "../meter/no-meter.ts";
import {
  isUnitLimitStop,
  memberLimitStop,
  memberRemovedStop,
  noPlanStop,
  planLimitStop,
  suspendedStop,
} from "../meter/plan-stops.ts";
import type { RunMeter } from "../meter/run-meter.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const ada: MeterPrincipal = { actor: "u/ada", scope: "o/acme", role: "member" };
const reached = {
  unit: "cost",
  used: 5,
  limit: 5,
  currency: "EUR",
  resetsAt: "2026-12-01T00:00:00.000Z",
  plan: { id: "pro", version: 1, name: "Pro" },
};
const costStop = planLimitStop({ ...reached, canUpgrade: true });
const memberCostStop = memberLimitStop(reached);

/** A meter whose answer to model calls a test changes as it goes; it allows everything else. */
class SwitchMeter extends NoMeter {
  modelCall: PlanStop | null;
  readonly checked: { principal: MeterPrincipal; kind: MeterCheckKind }[] = [];
  readonly principalsAsked: string[] = [];

  constructor(modelCall: PlanStop | null) {
    super();
    this.modelCall = modelCall;
  }

  override async check(
    principal: MeterPrincipal,
    request: { readonly kind: MeterCheckKind },
  ): Promise<MeterAnswer> {
    this.checked.push({ principal, kind: request.kind });
    if (request.kind !== "model-call" || this.modelCall === null) return { allowed: true };
    return { allowed: false, stop: this.modelCall };
  }

  /** The host's side: every run counts against Ada, whoever sends to it. */
  forAda(): RunMeter {
    return {
      meter: this,
      principalOf: async (topRunId) => {
        this.principalsAsked.push(topRunId);
        return ada;
      },
    };
  }
}

/** Two model steps, so a limit can be reached after the first. */
const twoSteps: Workflow = {
  ...replyWorkflow,
  states: {
    draft: { ...replyWorkflow.states["draft"], on: [{ to: "check", event: "done" }] },
    check: { ...replyWorkflow.states["draft"], on: [{ to: "sent", event: "done" }] },
    sent: { type: "final", on: [] },
  } as Workflow["states"],
};

function limitedRuns(meter: SwitchMeter, budget?: Budget, workflow: Workflow = replyWorkflow) {
  const runs = new KernelRuns();
  putSpentRun(runs, "run_0", { startedAt: "2026-01-02T08:00:00.000Z", cost: 0.6 });
  const ended = { runId: "run_0", seq: 3, at: "2026-01-02T08:00:00.000Z" };
  runs.logs.get("run_0")?.push({ ...ended, type: "run.completed", state: "done", context: {} });
  return runsOn([textAnswer("Dear support"), textAnswer("Checked")], runs, {
    workflow,
    workflows: { reply: replyWorkflow },
    meter: meter.forAda(),
    ...(budget === undefined ? {} : { budget }),
  });
}

function waitingEvents(log: readonly RunEvent[] | undefined) {
  return (log ?? []).filter((event) => event.type === "run.limit-waiting");
}

verifies("engine.plan-limit-wait", () => {
  it("waits for continue at a unit's limit, with nothing of the refused step logged", async () => {
    for (const stop of [costStop, memberCostStop]) {
      const { executor, model, runs, scheduler } = limitedRuns(new SwitchMeter(stop));
      const run = await executor.start(replyStart);
      expect(run).toMatchObject({ status: "waiting", accepts: ["continue"], limit: stop.cause });
      const log = runs.logs.get("run_1");
      expect(typesOf(log)).toEqual(["run.started", "run.limit-waiting"]);
      expect(model.requests).toHaveLength(0);
      const [waiting] = waitingEvents(log);
      const day = 24 * 60 * 60 * 1000;
      const until = new Date(Date.parse(waiting?.at ?? "") + 7 * day).toISOString();
      expect(waiting).toMatchObject({ until, cause: stop.cause });
      expect([...scheduler.timers.values()].map(({ at }) => at)).toEqual([until]);
    }
  });

  it("starts the refused step from its beginning on continue once the meter allows", async () => {
    const meter = new SwitchMeter(null);
    const { executor, model, runs, scheduler } = limitedRuns(meter, undefined, twoSteps);
    await executor.start(replyStart);
    meter.modelCall = costStop;
    // Only the first call: the wait's own timer would end the wait at once here.
    await scheduler.deliver("run_1", "call:call-1");
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting", state: "draft" });
    expect(model.requests).toHaveLength(1);
    meter.modelCall = null;
    await executor.send("run_1", "continue");
    await scheduler.runDue();
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(model.requests).toHaveLength(2);
    const types = typesOf(runs.logs.get("run_1"));
    expect(types.filter((type) => type === "agent.finished")).toHaveLength(2);
  });

  it("keeps waiting with the same stop and end when the meter still refuses", async () => {
    const { executor, model, runs } = limitedRuns(new SwitchMeter(costStop));
    await executor.start(replyStart);
    const run = await executor.send("run_1", "continue");
    expect(run).toMatchObject({ status: "waiting", limit: costStop.cause });
    const [first, again] = waitingEvents(runs.logs.get("run_1"));
    expect(again).toMatchObject({ until: first?.until, cause: costStop.cause });
    expect(model.requests).toHaveLength(0);
  });

  describe("final stops", () => {
    it("fails at plan.none, plan.suspended and plan.member-removed", async () => {
      for (const stop of [noPlanStop(), suspendedStop(), memberRemovedStop()]) {
        const { executor } = limitedRuns(new SwitchMeter(stop));
        const run = await executor.start(replyStart);
        expect(run).toMatchObject({ status: "failed", reason: "budget", cause: stop.cause });
      }
    });

    it("fails at budget.run and budget.month", async () => {
      for (const [budget, code] of [
        [{ currency: "EUR", perRun: 0 }, "budget.run"],
        [{ currency: "EUR", monthly: 0.5 }, "budget.month"],
      ] as const) {
        const { executor } = limitedRuns(new SwitchMeter(null), budget);
        const run = await executor.start(replyStart);
        expect(run).toMatchObject({ status: "failed", reason: "budget", cause: { code } });
      }
    });

    it("never waits at a step's own limit", () => {
      for (const code of ["harness.max-turns", "plan.concurrency", "plan.member-removed"]) {
        expect(isUnitLimitStop({ kind: "limit_reached", code })).toBe(false);
      }
    });

    it("fails with budget.month when it and a unit's limit are both reached", async () => {
      const budget = { currency: "EUR", monthly: 0.5 };
      const { executor } = limitedRuns(new SwitchMeter(costStop), budget);
      const run = await executor.start(replyStart);
      expect(run).toMatchObject({ status: "failed", cause: { code: "budget.month" } });
    });
  });

  it("doesn't wait while another call is in flight, as in a parallel state, and fails as before", async () => {
    const research: Workflow = {
      ...replyWorkflow,
      initial: "gather",
      states: {
        gather: {
          type: "parallel",
          branches: {
            web: { agent: "writer", input: "Search the web" },
            notes: { agent: "writer", input: "Read the notes" },
          },
          output: "findings",
          on: [{ to: "sent", event: "done" }],
        },
        sent: { type: "final", on: [] },
      } as Workflow["states"],
    };
    const { executor, model, runs } = limitedRuns(new SwitchMeter(costStop), undefined, research);
    const run = await executor.start(replyStart);
    expect(run).toMatchObject({ status: "failed", reason: "budget", cause: costStop.cause });
    expect(waitingEvents(runs.logs.get("run_1"))).toEqual([]);
    expect(model.requests).toHaveLength(0);
  });

  describe("a customer who isn't active", () => {
    it("fails a waiting run they continue", async () => {
      const meter = new SwitchMeter(costStop);
      const { executor } = limitedRuns(meter);
      await executor.start(replyStart);
      meter.modelCall = suspendedStop();
      const run = await executor.send("run_1", "continue");
      expect(run).toMatchObject({ status: "failed", cause: { code: "plan.suspended" } });
    });

    it("fails a running run at its next paid step", async () => {
      const meter = new SwitchMeter(null);
      const { executor, runs, scheduler } = limitedRuns(meter, undefined, twoSteps);
      await executor.start(replyStart);
      meter.modelCall = suspendedStop();
      await scheduler.runDue();
      const run = await runs.get("run_1");
      expect(run).toMatchObject({ status: "failed", cause: { code: "plan.suspended" } });
    });
  });

  it("fails a run nobody continued when its timer comes due, and not after continue", async () => {
    const { executor, runs, scheduler } = limitedRuns(new SwitchMeter(costStop));
    await executor.start(replyStart);
    await scheduler.runDue();
    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "budget",
      cause: costStop.cause,
    });

    const meter = new SwitchMeter(costStop);
    const continued = limitedRuns(meter);
    await continued.executor.start(replyStart);
    const [timer] = [...continued.scheduler.timers.values()];
    meter.modelCall = null;
    await continued.executor.send("run_1", "continue");
    await continued.scheduler.runDue();
    expect(await continued.runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(timer?.timerId).toMatch(/^timer:limit-wait:/);
  });

  it("asks for the run's own principal on continue, whoever sends it", async () => {
    const meter = new SwitchMeter(costStop);
    const { executor } = limitedRuns(meter);
    await executor.start(replyStart);
    meter.principalsAsked.length = 0;
    await executor.send("run_1", "continue");
    expect(meter.principalsAsked).toEqual(["run_1"]);
    expect(meter.checked.at(-1)).toEqual({ principal: ada, kind: "model-call" });
  });

  it("lets a waiting child run wait alone; continue sent to it lets both complete", async () => {
    const onboard: Workflow = {
      version: 1,
      id: "onboard",
      name: "Onboard",
      initial: "check",
      context: {},
      states: {
        check: { type: "workflow", workflow: "reply", on: [{ to: "done", event: "done" }] },
        done: { type: "final", on: [] },
      },
      layout: {},
    };
    const meter = new SwitchMeter(costStop);
    const { executor, runs, scheduler } = limitedRuns(meter, undefined, onboard);
    await executor.start({ ...replyStart, workflowId: "onboard" });
    const started = runs.logs.get("run_1")?.find((event) => event.type === "workflow.started");
    const child = started?.type === "workflow.started" ? started.childRunId : "";
    expect(await runs.get(child)).toMatchObject({ status: "waiting", limit: costStop.cause });
    expect(await runs.get("run_1")).toMatchObject({ status: "running" });
    meter.modelCall = null;
    await executor.send(child, "continue");
    await scheduler.runDue();
    expect(await runs.get(child)).toMatchObject({ status: "completed" });
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});
