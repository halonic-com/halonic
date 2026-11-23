// Local only counts as on when the live version or the saved files say on (HAL-16400): turning it
// on in Settings and saving keeps the next start on this computer, before it's made live, and
// turning it off waits until it's made live.

import { MemoryVcs } from "@halonicjs/adapter-memory";
import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageTimers } from "./engine-local-only.testing.ts";
import {
  acmeWithTwoProviders,
  answeringServer,
  countingIds,
  fakeShell,
  lockCalls,
  serviceOn,
} from "./engine-service.testing.ts";

const reply = { hubId: "support", workflowId: "reply" };
const localOnlyOff = "id: acme\nname: Acme\n";
const localOnlyOn = "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n";

const routinePath = "hubs/support/workflows/routines/hourly.routine.yaml";
const hourly = [
  "id: hourly",
  "name: Hourly",
  'trigger: { schedule: "0 * * * *" }',
  "run: { workflow: reply }",
  "",
].join("\n");

/** Acme in a repository whose one version has `live` as its workspace.yaml, then `saved` saved. */
async function acmeWithHistory(live: string, saved: string, more: Record<string, string> = {}) {
  const files = acmeWithTwoProviders({ "workspace.yaml": live, ...more });
  const vcs = new MemoryVcs(files);
  await vcs.init();
  await vcs.stage((await files.list()) ?? []);
  await vcs.commit("First version");
  await files.write("workspace.yaml", saved);
  return { files, vcs };
}

verifies("studio.engine-service", () => {
  describe("Local only, saved but not live", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps Run on this computer once it's turned on and saved, before it's made live", async () => {
      const { files, vcs } = await acmeWithHistory(localOnlyOff, localOnlyOn);
      const server = answeringServer();
      const options = { versions: vcs, http: server, ids: countingIds(), setTimer: pageTimers };
      const service = serviceOn(fakeShell(), files, options);

      const { id } = await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      expect(server.hosts).toEqual([]);
      const engine = await service.open();
      expect(await engine.runs.get(id)).toMatchObject({ status: "failed", reason: "local-only" });
      await service.close();
    });

    it("stays on this computer once it's turned off and saved, until that's made live", async () => {
      const { files, vcs } = await acmeWithHistory(localOnlyOn, localOnlyOff);
      const server = answeringServer();
      const options = { versions: vcs, http: server, ids: countingIds(), setTimer: pageTimers };
      const service = serviceOn(fakeShell(), files, options);

      const { id } = await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      expect(server.hosts).toEqual([]);
      const engine = await service.open();
      expect(await engine.runs.get(id)).toMatchObject({ status: "failed", reason: "local-only" });
      await service.close();
    });

    it("opens a new engine for the next start once it's turned on and saved", async () => {
      const { files, vcs } = await acmeWithHistory(localOnlyOff, localOnlyOff);
      const shell = fakeShell();
      const server = answeringServer();
      const options = { versions: vcs, http: server, ids: countingIds(), setTimer: pageTimers };
      const service = serviceOn(shell, files, options);
      await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);
      expect(server.hosts).toEqual(["models.acme.test"]);

      await files.write("workspace.yaml", localOnlyOn);
      const second = await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      expect(server.hosts).toEqual(["models.acme.test"]);
      const engine = await service.open();
      expect(await engine.runs.get(second.id)).toMatchObject({ reason: "local-only" });
      expect(lockCalls(shell)).toEqual([
        "engine_lock_hold",
        "engine_lock_release",
        "engine_lock_hold",
      ]);
      await service.close();
    });

    it("starts nothing while the saved workspace.yaml has an error", async () => {
      const saved = "id: acme\nname: Acme\nprivacy:\n  localOnly: maybe\n";
      const { files, vcs } = await acmeWithHistory(localOnlyOff, saved);
      const server = answeringServer();
      const service = serviceOn(fakeShell(), files, { versions: vcs, http: server });

      await expect(service.startRun(reply, {})).rejects.toMatchObject({
        kind: "invalid_input",
        message:
          "The saved workspace.yaml has an error on line 4, so Halonic can't tell whether Local only is on. Nothing started.",
        fix: "Fix the error in workspace.yaml, then try again.",
      });
      expect(server.hosts).toEqual([]);
    });
  });

  it("keeps a routine's start on this computer once it's turned on and saved", async () => {
    const { files, vcs } = await acmeWithHistory(localOnlyOff, localOnlyOn, {
      [routinePath]: hourly,
    });
    let now = new Date("2026-11-20T10:00:30.000Z");
    const wakeUps = new Set<() => void>();
    // A run's next step is due at once and fires straight away; the routine's tick waits.
    const setTimer: SetTimer = (callback, delayMs) => {
      if (delayMs <= 0) return pageTimers(callback, delayMs);
      wakeUps.add(callback);
      return () => wakeUps.delete(callback);
    };
    const server = answeringServer();
    const clock = { now: () => now };
    const options = { versions: vcs, http: server, ids: countingIds(), clock, setTimer };
    const service = serviceOn(fakeShell(), files, options);
    const engine = await service.open();
    await waitUntil("the scheduler's wake-up", () => wakeUps.size > 0);

    now = new Date("2026-11-20T11:00:30.000Z");
    for (const wakeUp of [...wakeUps]) wakeUp();
    await waitUntil("the routine's run to end", async () => {
      const ended = await engine.runs.list({ status: ["failed", "completed"] });
      return ended.length > 0;
    });

    expect(server.hosts).toEqual([]);
    const [run] = await engine.runs.list({});
    expect(run).toMatchObject({
      trigger: expect.objectContaining({ type: "schedule", routineId: "support/hourly" }),
      status: "failed",
      reason: "local-only",
    });
    await service.close();
  });
});
