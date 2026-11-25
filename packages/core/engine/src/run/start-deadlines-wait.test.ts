import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { NotingScheduler } from "../harness/harness-test-kit.test-helper.ts";
import { StartDeadlines } from "./start-deadlines.ts";

const clock: Clock = { now: () => new Date("2026-11-18T10:00:00.000Z") };

/** A scheduler that takes no timer. */
class RefusingScheduler extends NotingScheduler {
  override async schedule(): Promise<void> {
    throw new Error("The scheduler is down.");
  }
}

function waitSetup(scheduler = new NotingScheduler()) {
  const deadlines = new StartDeadlines(scheduler, clock);
  const sleep = deadlines.of("run_1", "call-1").wait;
  const timer = (n: number) =>
    scheduler.timers.get(JSON.stringify(["run_1", `start:wait:call-1:${n}`]));
  const arrive = (n: number) =>
    deadlines.expire({ key: "run_1", timerId: `start:wait:call-1:${n}`, at: "" });
  return { sleep, timer, arrive };
}

/** Whether `promise` has settled once the queued callbacks have run. */
async function settled(promise: Promise<void>): Promise<boolean> {
  let done = false;
  promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await Promise.resolve();
  return done;
}

verifies("engine.harness-hedge-wait", () => {
  it("sets one timer for the wait from now, and ends the wait when it arrives", async () => {
    const setup = waitSetup();

    const wait = setup.sleep(2 * 60_000);
    await Promise.resolve();
    expect(setup.timer(1)?.at).toBe("2026-11-18T10:02:00.000Z");
    setup.arrive(1);

    await expect(wait.done).resolves.toBeUndefined();
  });

  it("removes the timer of a wait given up on, and its late timer ends nothing", async () => {
    const setup = waitSetup();
    const first = setup.sleep(2 * 60_000);
    const second = setup.sleep(5 * 60_000);
    await Promise.resolve();

    first.cancel();
    first.cancel();
    setup.arrive(1);

    expect(setup.timer(1)).toBeUndefined();
    expect(setup.timer(2)?.at).toBe("2026-11-18T10:05:00.000Z");
    expect(await settled(first.done)).toBe(false);
    expect(await settled(second.done)).toBe(false);
  });

  it("fails with the scheduler's error when it doesn't take the timer", async () => {
    const setup = waitSetup(new RefusingScheduler());

    await expect(setup.sleep(60_000).done).rejects.toThrow("The scheduler is down.");
  });

  it("stays quiet when the scheduler refuses a wait already given up on", async () => {
    const setup = waitSetup(new RefusingScheduler());

    const wait = setup.sleep(60_000);
    wait.cancel();

    expect(await settled(wait.done)).toBe(false);
  });
});
