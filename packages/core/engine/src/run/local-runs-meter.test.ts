import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Budget } from "../budget/budget.ts";
import { putSpentRun } from "../budget/budget-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import type {
  Meter,
  MeterAnswer,
  MeterCheckKind,
  MeterPrincipal,
  MeterUsage,
  PlanStop,
} from "../meter/meter.ts";
import { NoMeter } from "../meter/no-meter.ts";
import {
  concurrencyStop,
  memberRemovedStop,
  planLimitStop,
  suspendedStop,
} from "../meter/plan-stops.ts";
import { PlanRefusedError, type RunMeter } from "../meter/run-meter.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const ada: MeterPrincipal = { actor: "u/ada", scope: "o/acme", role: "member" };

const costStop = planLimitStop({
  unit: "cost",
  used: 5,
  limit: 5,
  currency: "EUR",
  resetsAt: "2026-12-01T00:00:00.000Z",
  plan: { id: "pro", version: 1, name: "Pro" },
  canUpgrade: true,
});

/** A meter that notes what it is asked and answers each check as `answer` says. */
class NotingMeter extends NoMeter implements Meter {
  readonly checks: { principal: MeterPrincipal; kind: MeterCheckKind }[] = [];
  readonly records: MeterUsage[] = [];
  readonly principalsAsked: string[] = [];
  readonly #answer: (kind: MeterCheckKind) => MeterAnswer;

  constructor(answer: (kind: MeterCheckKind) => MeterAnswer = () => ({ allowed: true })) {
    super();
    this.#answer = answer;
  }

  override async check(principal: MeterPrincipal, request: { readonly kind: MeterCheckKind }) {
    this.checks.push({ principal, kind: request.kind });
    return this.#answer(request.kind);
  }

  override async record(_principal: MeterPrincipal, usage: MeterUsage): Promise<void> {
    this.records.push(usage);
  }

  /** The host's side: every run counts against Ada. */
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

/** A meter that refuses `kind` with `stop` and allows the rest. */
function refusing(kind: MeterCheckKind, stop: PlanStop): NotingMeter {
  return new NotingMeter((asked) =>
    asked === kind ? { allowed: false, stop } : { allowed: true },
  );
}

function meteredRuns(meter?: RunMeter, budget?: Budget, workflow: Workflow = replyWorkflow) {
  const runs = new KernelRuns();
  const startedAt = "2026-01-02T08:00:00.000Z";
  putSpentRun(runs, "run_0", { startedAt, cost: 0.6 });
  // Ended, so the sweep of lost runs leaves it and the meter hears only of the runs a test starts.
  runs.logs.get("run_0")?.push({
    runId: "run_0",
    seq: 3,
    at: startedAt,
    type: "run.completed",
    state: "done",
    context: {},
  });
  return runsOn([textAnswer("Dear support")], runs, {
    workflow,
    workflows: { reply: replyWorkflow },
    ...(meter === undefined ? {} : { meter }),
    ...(budget === undefined ? {} : { budget }),
  });
}

verifies("engine.meter-checks", () => {
  it("runs as before with the default NoMeter, and asks a meter at each point", async () => {
    const meter = new NotingMeter();
    const logs: string[][] = [];
    for (const given of [
      undefined,
      { meter: new NoMeter(), principalOf: async () => ada },
      meter.forAda(),
    ]) {
      const { executor, runs, scheduler } = meteredRuns(given);
      await executor.start(replyStart);
      await scheduler.runDue();
      expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
      logs.push(typesOf(runs.logs.get("run_1")));
    }
    expect(logs[1]).toEqual(logs[0]);
    expect(logs[2]).toEqual(logs[0]);
    expect(meter.checks).toEqual([
      { principal: ada, kind: "run-start" },
      { principal: ada, kind: "model-call" },
    ]);
    expect(meter.records).toEqual([{ kind: "run", runId: "run_1", status: "completed" }]);
  });

  it("stops a run before its model call when the meter refuses with a final stop, with the meter's cause", async () => {
    for (const stop of [suspendedStop(), memberRemovedStop()]) {
      const { executor, model, runs, scheduler } = meteredRuns(
        refusing("model-call", stop).forAda(),
      );
      const run = await executor.start(replyStart);
      expect(run).toMatchObject({
        status: "failed",
        state: "draft",
        reason: "budget",
        error: stop.error,
        cause: stop.cause,
      });
      expect(typesOf(runs.logs.get("run_1")).at(-1)).toBe("run.failed");
      expect(model.requests).toHaveLength(0);
      expect(scheduler.timers.size).toBe(0);
    }
  });

  describe("checks from inner to outer", () => {
    it("lets the run budget stop a run before the meter is asked", async () => {
      const meter = refusing("model-call", costStop);
      const { executor } = meteredRuns(meter.forAda(), { currency: "EUR", perRun: 0 });
      const run = await executor.start(replyStart);
      expect(run.cause).toMatchObject({ code: "budget.run" });
      expect(meter.checks.map(({ kind }) => kind)).toEqual(["run-start"]);
    });

    it("asks the meter before the monthly budget", async () => {
      const { executor } = meteredRuns(refusing("model-call", suspendedStop()).forAda(), {
        currency: "EUR",
        monthly: 0.5,
      });
      const run = await executor.start(replyStart);
      expect(run.cause).toMatchObject({ code: "plan.suspended" });
    });
  });

  it("refuses a start past the cap of runs at once, and records nothing", async () => {
    const stop = concurrencyStop(2, 2, "scope");
    const { executor, runs, model } = meteredRuns(refusing("run-start", stop).forAda());
    const refused = executor.start(replyStart);
    await expect(refused).rejects.toThrow(PlanRefusedError);
    await expect(refused).rejects.toMatchObject({
      kind: "limit_reached",
      failureCause: stop.cause,
    });
    expect(await runs.get("run_1")).toBeNull();
    expect(model.requests).toHaveLength(0);
  });

  describe("fails closed", () => {
    it("refuses with plan.none when the meter's answer has no stop", async () => {
      const meter = new NotingMeter((kind) =>
        kind === "model-call" ? ({ allowed: false } as unknown as MeterAnswer) : { allowed: true },
      );
      const { executor } = meteredRuns(meter.forAda());
      const run = await executor.start(replyStart);
      expect(run).toMatchObject({
        status: "failed",
        reason: "budget",
        cause: { code: "plan.none" },
      });
    });

    it("makes no call and records no run when the meter can't be asked", async () => {
      const broken = new NotingMeter((kind) => {
        if (kind === "model-call") throw new Error("The meter is unreachable.");
        return { allowed: true };
      });
      const { executor, runs, model } = meteredRuns(broken.forAda());
      await expect(executor.start(replyStart)).rejects.toThrow("The meter is unreachable.");
      expect(await runs.get("run_1")).toBeNull();
      expect(model.requests).toHaveLength(0);
    });
  });

  it("counts a child run against its top-level run's principal, and only the top-level run's end", async () => {
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
    const meter = new NotingMeter();
    const { executor, runs, scheduler } = meteredRuns(meter.forAda(), undefined, onboard);
    await executor.start({ ...replyStart, workflowId: "onboard" });
    await scheduler.runDue();
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(new Set(meter.principalsAsked)).toEqual(new Set(["run_1"]));
    expect(meter.checks.map(({ kind }) => kind)).toEqual(["run-start", "model-call"]);
    expect(meter.records).toEqual([{ kind: "run", runId: "run_1", status: "completed" }]);
  });

  describe("records a top-level run's end once, however it ended", () => {
    const failedRun = { kind: "run", runId: "run_1", status: "failed" };

    it("records a cancelled run once, though it is cancelled twice", async () => {
      const meter = new NotingMeter();
      const { executor, runs } = meteredRuns(meter.forAda());
      await executor.start(replyStart);
      await executor.cancel("run_1");
      await executor.cancel("run_1");
      expect(await runs.get("run_1")).toMatchObject({ status: "failed", reason: "cancelled" });
      expect(meter.records).toEqual([failedRun]);
    });

    it("records a run the engine lost once, when the next engine ends it as interrupted", async () => {
      const before = meteredRuns(new NotingMeter().forAda());
      await before.executor.start(replyStart);
      const meter = new NotingMeter();
      const after = runsOn([], before.runs, { workflow: replyWorkflow, meter: meter.forAda() });
      await after.executor.cancel("run_1");
      expect(await before.runs.get("run_1")).toMatchObject({ reason: "interrupted" });
      expect(meter.records).toEqual([failedRun]);
    });
  });
});
