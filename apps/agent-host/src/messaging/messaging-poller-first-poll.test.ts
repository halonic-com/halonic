import { MemoryScheduler } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MessagingPoller } from "./messaging-poller.ts";

/** A poller on a memory scheduler whose clock the test moves; nothing runs until `wait`. */
async function startPolling() {
  let now = Date.parse("2026-11-25T10:00:00.000Z");
  const clock = { now: () => new Date(now) };
  let polls = 0;
  let poller: MessagingPoller | undefined;
  const scheduler = new MemoryScheduler(
    {
      onTimer: async (timer) => {
        await poller?.onTimer(timer);
      },
      onTick: async () => {},
    },
    clock,
  );
  poller = new MessagingPoller({
    scheduler,
    clock,
    poll: async () => {
      polls += 1;
    },
  });
  await poller.start();
  const wait = async (ms: number) => {
    now += ms;
    await scheduler.runDue();
  };
  return { poller, wait, polls: () => polls };
}

verifies("agent-host.paperclip-first-poll", () => {
  it("reads at once when a sign-in connects, then 30 seconds after that read", async () => {
    const { poller, wait, polls } = await startPolling();
    await wait(10_000);

    await poller.pollNow();
    await wait(0);
    expect(polls()).toBe(1);
    await wait(29_999);
    expect(polls()).toBe(1);
    await wait(1);
    expect(polls()).toBe(2);
  });

  it("starts no read once polling has stopped", async () => {
    const { poller, wait, polls } = await startPolling();
    await poller.stop();

    await poller.pollNow();
    await wait(60_000);
    expect(polls()).toBe(0);
  });
});
