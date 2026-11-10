// What Halonic sends the runner: a cap on what the runner leaves unread, a
// clear reason when `start` can't be sent, and no call number used up by a
// call that couldn't be sent (HAL-4353, from the review of #1362).

import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FrameTooLargeError } from "../frame-lines.ts";
import { maxFrameBytes } from "../frames.ts";
import { bridgeOptions, fakeRunnerProcess, HandDrivenRunner } from "../pipes.test-helper.ts";
import { type ConnectRunnerOptions, connectRunner } from "./connect-runner.ts";
import { RunnerStoppedError } from "./limits.ts";

async function startedRunner(overrides: Partial<ConnectRunnerOptions> = {}) {
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake, overrides);
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  await runner.start();
  const connection = await connecting;
  return { fake, options, runner, connection };
}

verifies("integration-runner.call-limits", () => {
  describe("the cap on frames the runner leaves unread", () => {
    it("stops a runner that doesn't read its stdin once Halonic's queue passes the cap", async () => {
      const { fake, connection } = await startedRunner({
        limits: { maxQueuedWriteBytes: 1024, pingIntervalMs: 60_000 },
      });
      // The runner reads nothing more, so each call frame waits in Halonic's queue.
      const args = { text: "x".repeat(600) };
      const calls = [1, 2, 3].map(() => connection.callTool("echo", args));
      for (const call of calls) {
        await expect(call).rejects.toBeInstanceOf(RunnerStoppedError);
      }
      expect(await connection.stopped).toEqual({ reason: "channel-failed" });
      expect(fake.kills()).toBe(1);
    });

    it("keeps a runner that reads what it is sent", async () => {
      const { fake, runner, connection } = await startedRunner({
        limits: { maxQueuedWriteBytes: 1024, pingIntervalMs: 60_000 },
      });
      const args = { text: "x".repeat(600) };
      for (let n = 0; n < 3; n += 1) {
        const result = connection.callTool("echo", args);
        const frame = await runner.next();
        if (frame.type !== "call") throw new Error(`expected a call, got ${frame.type}`);
        await runner.send({ type: "result", call: frame.call, text: "ok" });
        expect(await result).toBe("ok");
      }
      expect(fake.kills()).toBe(0);
      await connection.close();
    });
  });

  it("stops with start-too-large when the settings don't fit in a frame, and blames nobody", async () => {
    const fake = fakeRunnerProcess();
    const options = bridgeOptions(fake, { settings: { notes: "n".repeat(maxFrameBytes) } });
    const runner = new HandDrivenRunner(fake);
    const connecting = connectRunner(options);
    await runner.send({ type: "ready", nonce: options.nonce });
    await expect(connecting).rejects.toMatchObject({ stop: { reason: "start-too-large" } });
    expect(options.blocks).toEqual([]);
    expect(fake.kills()).toBe(1);
  });

  it("uses up no call number for a call whose arguments are too large to send", async () => {
    const { options, runner, connection } = await startedRunner({
      limits: { pingIntervalMs: 60_000 },
    });
    await expect(
      connection.callTool("echo", { text: "x".repeat(maxFrameBytes) }),
    ).rejects.toBeInstanceOf(FrameTooLargeError);

    const result = connection.callTool("echo", { text: "small" });
    expect(await runner.next()).toMatchObject({ type: "call", call: 0 });
    await runner.send({ type: "result", call: 0, text: "ok" });
    expect(await result).toBe("ok");
    expect(options.blocks).toEqual([]);
    await connection.close();
  });
});
