// A save that turns Local only on or off opens a new engine once no run is going (HAL-16381), so a
// run waiting for a timer resumes with the new setting.

import type { HttpClient } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  acmeWithTwoProviders,
  answeringServer,
  countingIds,
  fakeShell,
  lockCalls,
  serviceOn,
} from "./engine-service.testing.ts";

const localOnly = "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n";

/** `later` waits an hour, then runs the writer, whose model is in the cloud. */
const later = [
  "id: later",
  "name: Later",
  "initial: pause",
  "states:",
  "  pause:",
  "    type: wait",
  "    on:",
  "      - to: write",
  "        after: 1h",
  "  write:",
  "    agent: writer",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

/** Acme with `later`, on a service whose clock and wake-ups the test moves on by hand. */
function acmeWithLater(http: HttpClient) {
  const files = acmeWithTwoProviders();
  const shell = fakeShell();
  const wakeUps = new Set<() => void>();
  const clock = { now: new Date("2026-11-22T10:00:00.000Z") };
  const service = serviceOn(shell, files, {
    http,
    ids: countingIds(),
    clock: { now: () => clock.now },
    setTimer: (callback) => {
      wakeUps.add(callback);
      return () => wakeUps.delete(callback);
    },
  });
  /** Wakes the scheduler, as its timer would. */
  const wake = () => {
    for (const wakeUp of [...wakeUps]) wakeUp();
  };
  /** Moves the clock on by an hour and wakes the scheduler. */
  const anHourLater = () => {
    clock.now = new Date(clock.now.getTime() + 3_600_000);
    wake();
  };
  return { files, shell, service, wake, anHourLater };
}

verifies("studio.engine-local-only-save", () => {
  it("resumes a run waiting for a timer on a new engine, with the Local only just saved", async () => {
    const server = answeringServer();
    const { files, shell, service, wake, anHourLater } = acmeWithLater(server);
    await files.write("hubs/support/workflows/later.workflow.yaml", later);
    const { id } = await service.startRun({ hubId: "support", workflowId: "later" }, {});
    expect((await (await service.open()).runs.get(id))?.status).toBe("waiting");

    await files.write("workspace.yaml", localOnly);
    await service.reopenOnLocalOnlySave();
    anHourLater();

    const engine = await service.open();
    // The new engine's scheduler sets its wake-up once it has started.
    await waitUntil("the run resumed", async () => {
      wake();
      return (await engine.runs.get(id))?.status === "failed";
    });
    expect(await engine.runs.get(id)).toMatchObject({ reason: "local-only" });
    expect(server.hosts).toEqual([]);
    expect(lockCalls(shell)).toEqual([
      "engine_lock_hold",
      "engine_lock_release",
      "engine_lock_hold",
    ]);
    await service.close();
  });

  it("keeps the engine while a run is going, and that run goes on", async () => {
    const held: HttpClient = {
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    };
    const { files, shell, service, anHourLater } = acmeWithLater(held);
    const { id } = await service.startRun({ hubId: "support", workflowId: "reply" }, {});
    anHourLater();
    const engine = await service.open();
    await waitUntil("the run going", async () => (await engine.runs.get(id))?.status === "running");

    await files.write("workspace.yaml", localOnly);
    await service.reopenOnLocalOnlySave();

    expect(await service.open()).toBe(engine);
    expect((await engine.runs.get(id))?.status).toBe("running");
    expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
    await service.close();
  });

  it("opens nothing when no engine is open, and keeps one whose Local only didn't change", async () => {
    const { files, shell, service } = acmeWithLater(answeringServer());

    await files.write("workspace.yaml", localOnly);
    await service.reopenOnLocalOnlySave();
    expect(lockCalls(shell)).toEqual([]);

    const engine = await service.open();
    await files.write("hubs/support/agents/writer.agent.yaml", "id: writer\nname: Writer\n");
    await service.reopenOnLocalOnlySave();
    expect(await service.open()).toBe(engine);
    expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
    await service.close();
  });
});
