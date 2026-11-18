import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { NotingScheduler } from "../harness/harness-test-kit.test-helper.ts";
import { StartDeadlines } from "./start-deadlines.ts";

const timerId = "start:step:call-1";

/** A clock that stays where a test puts it. */
function handClock() {
  let now = Date.parse("2026-11-18T10:00:00.000Z");
  const clock: Clock = { now: () => new Date(now) };
  return {
    clock,
    pass: (minutes: number) => {
      now += minutes * 60_000;
    },
  };
}

function runningSetup() {
  const scheduler = new NotingScheduler();
  const { clock, pass } = handClock();
  const deadlines = new StartDeadlines(scheduler, clock);
  let timesUp = 0;
  const start = () =>
    deadlines.of("run_1", "call-1").running(10 * 60_000, () => {
      timesUp += 1;
    });
  const timer = () => scheduler.timers.get(JSON.stringify(["run_1", timerId]));
  const arrive = () => deadlines.expire({ key: "run_1", timerId, at: "" });
  return { start, timer, arrive, pass, timesUp: () => timesUp };
}

verifies("engine.harness-step-limits", () => {
  it("sets the timer for the limit from now, and says when the time is up", async () => {
    const setup = runningSetup();

    await setup.start();
    setup.arrive();
    setup.arrive();

    expect(setup.timer()?.at).toBe("2026-11-18T10:10:00.000Z");
    expect(setup.timesUp()).toBe(1);
  });

  it("doesn't count the time between pause and resume, and goes on with what was left", async () => {
    const setup = runningSetup();
    const limit = await setup.start();

    setup.pass(4);
    await limit.pause();
    expect(setup.timer()).toBeUndefined();
    setup.arrive();
    setup.pass(60);
    await limit.resume();

    expect(setup.timer()?.at).toBe("2026-11-18T11:10:00.000Z");
    expect(setup.timesUp()).toBe(0);
  });

  it("changes nothing when its timer arrives after the end", async () => {
    const setup = runningSetup();
    const limit = await setup.start();

    await limit.end();
    await limit.resume();
    setup.arrive();

    expect(setup.timer()).toBeUndefined();
    expect(setup.timesUp()).toBe(0);
  });
});
