import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  ada,
  bea,
  codeOf,
  dan,
  detailOf,
  type MakeMeter,
  type MeterTestAnswer,
  type MeterTestReservation,
  meterResetsAt,
} from "./meter-harness.ts";

/** The contract every `Meter` backend passes, in the order of the port's methods. */
export function meterContract<Usage, Times>(name: string, make: MakeMeter<Usage, Times>): void {
  verifies("contracts.meter", () => {
    describe(`Meter contract: ${name}`, () => {
      describeCheck(make);
      describeReserve(make);
      describeSettle(make);
      describeRecord(make);
    });
  });
}

function describeCheck<Usage, Times>(make: MakeMeter<Usage, Times>): void {
  describe("check", () => {
    it("allows a model call and a run start under the limits", async () => {
      const { meter } = await make({ pool: { cost: 10, runs: 5 }, concurrency: 2 });
      expect(await meter.check(ada, { kind: "model-call" })).toEqual({ allowed: true });
      expect(await meter.check(ada, { kind: "run-start" })).toEqual({ allowed: true });
    });

    it("records nothing, so the whole pool can still be held after many checks", async () => {
      const { meter } = await make({ pool: { cost: 10 } });
      for (let count = 0; count < 5; count += 1) await meter.check(ada, { kind: "model-call" });
      expect((await meter.reserve(ada, { cost: 10 })).allowed).toBe(true);
    });

    it("refuses once a unit is used up, saying how much and until when", async () => {
      const { meter, usage } = await make({ pool: { cost: 10 } });
      await meter.record(ada, usage.modelCall(10));
      const refused = await meter.check(ada, { kind: "model-call" });
      expect(codeOf(refused)).toBe("plan.cost");
      expect(detailOf(refused)).toMatchObject({
        unit: "cost",
        used: "10",
        limit: "10",
        resetsAt: meterResetsAt,
      });
    });

    it("refuses a run start at the cap on runs at once, and still allows a model call", async () => {
      const { meter, startRun } = await make({ pool: { cost: 10 }, concurrency: 1 });
      await startRun(ada, "run_acme_1");
      const refused = await meter.check(bea, { kind: "run-start" });
      expect(codeOf(refused)).toBe("plan.concurrency");
      expect(detailOf(refused)).toMatchObject({ running: "1", limit: "1" });
      expect(await meter.check(bea, { kind: "model-call" })).toEqual({ allowed: true });
    });

    it("refuses a member whose share is used up, and not the others", async () => {
      const { meter, usage } = await make({ pool: { steps: 10 }, beaShare: { steps: 1 } });
      await meter.record(bea, usage.modelCall(0));
      const refused = await meter.check(bea, { kind: "model-call" });
      expect(codeOf(refused)).toBe("plan.member.steps");
      expect(detailOf(refused)).toMatchObject({ used: "1", limit: "1" });
      expect(await meter.check(ada, { kind: "model-call" })).toEqual({ allowed: true });
    });

    it("refuses someone the organisation no longer lists", async () => {
      const { meter } = await make({ pool: { cost: 10 } });
      expect(codeOf(await meter.check(dan, { kind: "run-start" }))).toBe("plan.member-removed");
      expect(codeOf(await meter.reserve(dan, { cost: 1 }))).toBe("plan.member-removed");
    });
  });
}

function describeReserve<Usage, Times>(make: MakeMeter<Usage, Times>): void {
  describe("reserve", () => {
    it("counts what a step holds back against the next step", async () => {
      const { meter } = await make({ pool: { cost: 10 } });
      const first = await meter.reserve(ada, { cost: 6 });
      expect(first.allowed).toBe(true);
      const second = await meter.reserve(bea, { cost: 6 });
      expect(codeOf(second)).toBe("plan.cost");
      expect(detailOf(second)).toMatchObject({ phase: "reserve", needed: "6", left: "4" });
    });

    it("refuses a step whose maximum is over a member's share", async () => {
      const { meter } = await make({ pool: { cost: 10 }, beaShare: { cost: 2 } });
      const refused = await meter.reserve(bea, { cost: 3 });
      expect(codeOf(refused)).toBe("plan.member.cost");
      expect(detailOf(refused)).toMatchObject({ needed: "3", left: "2" });
    });

    it("never holds back more than the pool when steps reserve at once", async () => {
      const { meter } = await make({ pool: { cost: 10 } });
      const answers = await Promise.all(
        Array.from({ length: 6 }, (_, index) => meter.reserve(index % 2 ? ada : bea, { cost: 3 })),
      );
      expect(answers.filter((answer) => answer.allowed)).toHaveLength(3);
    });
  });
}

function describeSettle<Usage, Times>(make: MakeMeter<Usage, Times>): void {
  describe("settle", () => {
    it("lets go of what the step held back", async () => {
      const { meter, usage } = await make({ pool: { cost: 10 } });
      const held = await meter.reserve(ada, { cost: 6 });
      await meter.settle(reservationOf(held), usage.stepTimes(0));
      expect((await meter.reserve(ada, { cost: 6 })).allowed).toBe(true);
    });

    it("counts the step's harness time", async () => {
      const { meter, usage } = await make({ pool: { harnessMinutes: 1 } });
      const held = await meter.reserve(ada, { minutes: 1 });
      await meter.settle(reservationOf(held), usage.stepTimes(60_000));
      const refused = await meter.check(ada, { kind: "model-call" });
      expect(codeOf(refused)).toBe("plan.harnessMinutes");
      expect(detailOf(refused)).toMatchObject({ used: "1", limit: "1" });
    });
  });
}

function describeRecord<Usage, Times>(make: MakeMeter<Usage, Times>): void {
  describe("record", () => {
    it("counts a model call as one step", async () => {
      const { meter, usage } = await make({ pool: { steps: 1 } });
      await meter.record(ada, usage.modelCall(0));
      expect(codeOf(await meter.check(ada, { kind: "model-call" }))).toBe("plan.steps");
    });

    it("counts a model call's cost", async () => {
      const { meter, usage } = await make({ pool: { cost: 10 } });
      await meter.record(ada, usage.modelCall(4));
      const tooBig = await meter.reserve(ada, { cost: 7 });
      expect(detailOf(tooBig)).toMatchObject({ unit: "cost", needed: "7", left: "6" });
    });

    it("counts the tokens of a model call, input and output together", async () => {
      const { meter, usage } = await make({ pool: { tokens: 1_200 } });
      await meter.record(ada, usage.modelCall(0));
      const refused = await meter.check(ada, { kind: "model-call" });
      expect(codeOf(refused)).toBe("plan.tokens");
      expect(detailOf(refused)).toMatchObject({ used: "1200", limit: "1200" });
    });

    it("counts nothing for an answer from the cache", async () => {
      const { meter, usage } = await make({ pool: { steps: 1 } });
      await meter.record(ada, usage.modelCall(0, { cached: true }));
      expect(await meter.check(ada, { kind: "model-call" })).toEqual({ allowed: true });
    });

    // A run's end recorded twice should count once too; `ConfigMeter` counts it twice, so that case
    // waits for its fix (HAL-18110) before it joins the suite.
    it("counts a run's end against the runs, whichever way it ended", async () => {
      const { meter, usage } = await make({ pool: { runs: 2 } });
      await meter.record(ada, usage.runEnd("run_acme_1", "completed"));
      expect(await meter.check(ada, { kind: "run-start" })).toEqual({ allowed: true });
      await meter.record(bea, usage.runEnd("run_acme_2", "failed"));
      const refused = await meter.check(ada, { kind: "run-start" });
      expect(codeOf(refused)).toBe("plan.runs");
      expect(detailOf(refused)).toMatchObject({ used: "2", limit: "2" });
    });
  });
}

/** The reservation an allowed `reserve` gave. */
function reservationOf(answer: MeterTestAnswer): MeterTestReservation {
  if (!answer.allowed || answer.reservation === undefined) {
    throw new Error("The step should have been allowed, with a reservation.");
  }
  return answer.reservation;
}
