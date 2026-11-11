import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { placedRoutines } from "@halonicjs/app";
import type { RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { CommandContext } from "../../command.ts";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import {
  type AcmeRuns,
  makeAcmeRuns,
  removeAcmeRuns,
  running,
  storeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { reportGaveUp, reportStuck } from "./watch-stuck.ts";

/** Starts Follow up at the top of every hour. */
const hourly = [
  "id: hourly-follow-up",
  "name: Hourly follow-up",
  "trigger: { every: 1h }",
  "run: { workflow: follow-up }",
  "",
].join("\n");

const stuckTimer = {
  error: new Error("model refused"),
  timer: { key: "run_mfx3k2a1_09d9f0", timerId: "call:draft", at: "2026-11-10T15:00:02.000Z" },
};

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-watch-stuck");
  await writeFiles(acmeRuns.acme, {
    "hubs/support/workflows/routines/hourly-follow-up.routine.yaml": hourly,
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** A command context that keeps the printed and `--debug` lines as plain text. */
function stuckContext() {
  const lines: string[] = [];
  const debug: string[] = [];
  const context = {
    printAhead: (line: Phrase) => lines.push(plainText(line)),
    debug: (line: Phrase) => debug.push(plainText(line)),
  } as unknown as CommandContext;
  return { context, lines, debug };
}

async function acmeRoutines() {
  return placedRoutines(await loadWorkspace(new FolderDefinitionStore(acmeRuns.acme, "./acme")));
}

verifies("cli.commands.routines.watch", () => {
  it("prints a ✕ line for a routine's run that got stuck, with why under --debug", async () => {
    await storeRuns(acmeRuns, {
      id: stuckTimer.timer.key,
      start: "2026-11-10T15:00:01.000Z",
      trigger: {
        type: "every",
        routineId: "support/hourly-follow-up",
        at: "2026-11-10T15:00:00.000Z",
      },
    });
    const { context, lines, debug } = stuckContext();
    const runs = await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile);

    await reportStuck(context, await acmeRoutines(), runs, stuckTimer);

    expect(lines).toEqual(["✕ Hourly follow-up got stuck · run 09d9f0 · see why with --debug"]);
    expect(debug).toEqual([
      "Run run_mfx3k2a1_09d9f0 is stuck: its timer call:draft failed 3 times, and the engine keeps retrying it: model refused",
    ]);
  });

  it("names no routine for a stuck run that no routine started", async () => {
    await storeRuns(acmeRuns, running);
    const { context, lines } = stuckContext();
    const runs = await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile);

    await reportStuck(context, await acmeRoutines(), runs, {
      ...stuckTimer,
      timer: { ...stuckTimer.timer, key: running.id },
    });

    expect(lines).toEqual(["✕ A run got stuck · run 09d9c0 · see why with --debug"]);
  });

  it("names no routine, and says why under --debug, when the run log can't be read", async () => {
    const { context, lines, debug } = stuckContext();
    const runs = { get: () => Promise.reject(new Error("disk")) } as unknown as RunStore;

    await reportStuck(context, await acmeRoutines(), runs, stuckTimer);

    expect(lines).toEqual(["✕ A run got stuck · run 09d9f0 · see why with --debug"]);
    expect(debug[0]).toBe(
      "Couldn't read which routine started run run_mfx3k2a1_09d9f0: Error: disk",
    );
  });

  it("prints a ✕ line for a routine's run it gave up on, and that it was cancelled under --debug (HAL-5294)", async () => {
    await storeRuns(acmeRuns, {
      id: stuckTimer.timer.key,
      start: "2026-11-10T15:00:01.000Z",
      trigger: {
        type: "every",
        routineId: "support/hourly-follow-up",
        at: "2026-11-10T15:00:00.000Z",
      },
    });
    const { context, lines, debug } = stuckContext();
    const runs = await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile);

    await reportGaveUp(context, await acmeRoutines(), runs, { ...stuckTimer, cancelled: true });

    expect(lines).toEqual([
      "✕ Gave up on Hourly follow-up after an hour · run 09d9f0 · see why with --debug",
    ]);
    expect(debug).toEqual([
      "Gave up on run run_mfx3k2a1_09d9f0: its timer call:draft kept failing for an hour, so the run was cancelled: model refused",
    ]);
  });

  it("says under --debug when cancelling the run it gave up on failed too", async () => {
    await storeRuns(acmeRuns, running);
    const { context, lines, debug } = stuckContext();
    const runs = await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile);

    await reportGaveUp(context, await acmeRoutines(), runs, {
      ...stuckTimer,
      timer: { ...stuckTimer.timer, key: running.id },
      cancelled: false,
      cancelError: new Error("disk full"),
    });

    expect(lines).toEqual(["✕ Gave up on a run after an hour · run 09d9c0 · see why with --debug"]);
    expect(debug).toEqual([
      `Gave up on run ${running.id}: its timer call:draft kept failing for an hour: model refused. Cancelling the run failed too, so its step isn't tried again until the next watch or run: disk full`,
    ]);
  });
});
