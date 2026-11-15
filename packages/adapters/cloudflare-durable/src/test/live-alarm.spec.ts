/**
 * The live-only check of Durable Object alarms (HAL-6703): the real `RunObject` with the real
 * clock, so Cloudflare itself fires the alarm. The adapter's contract specs move a fake clock and
 * call `fireAlarm()` themselves, so they can't show this. It runs in local workerd
 * (`live-alarm.test.ts`) and in the live test Worker (`live/adapters.live.test.ts` in
 * `testing-cloudflare-live`), where it binds `LIVE_RUNS` itself.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { RunObject } from "../run-object.ts";

/** What the runner binds for this suite. */
interface LiveEnv {
  LIVE_RUNS: DurableObjectNamespace<LiveRunObject>;
}

/** A `RunObject` whose timer listener records, in the object's own storage, what the alarm delivered. */
export class LiveRunObject extends RunObject {
  protected override timerListener() {
    return {
      onTimer: async (timer: { key: string; timerId: string }): Promise<void> => {
        await this.ctx.storage.put(`fired:${timer.timerId}`, Date.now());
      },
    };
  }

  protected override runList() {
    return { publish: async (): Promise<void> => {} };
  }

  /** The ids of the timers the alarm has delivered. */
  async delivered(): Promise<string[]> {
    const fired = await this.ctx.storage.list({ prefix: "fired:" });
    return [...fired.keys()].map((key) => key.slice("fired:".length));
  }
}

/** Longest wait for the alarm; the runner's call to a case times out at 55 s. */
const waitMs = 45_000;

describe("Durable Object alarm, real clock", () => {
  it("fires a timer a few seconds ahead, once, through the platform's own alarm", async () => {
    const { LIVE_RUNS } = env as LiveEnv;
    const key = `live-${crypto.randomUUID()}`;
    const object = LIVE_RUNS.get(LIVE_RUNS.idFromName(key));
    await object.schedule(key, "wait", new Date(Date.now() + 3000).toISOString());
    expect((await object.pending(key)).map((timer) => timer.timerId)).toEqual(["wait"]);
    expect(await object.delivered()).toEqual([]);

    const deadline = Date.now() + waitMs;
    let delivered: string[] = [];
    while (delivered.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      delivered = await object.delivered();
    }
    expect(delivered).toEqual(["wait"]);
    expect(await object.pending(key)).toEqual([]);
  });
});
