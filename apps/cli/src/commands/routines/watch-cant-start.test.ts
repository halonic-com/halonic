import { RunHistory } from "@halonicjs/app";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { type FakeTime, fakeTime, wokenUp } from "../../test/fake-time.ts";
import { engineStart } from "../../test/run-setup.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { routinesCommandWith } from "./command.ts";

/** Follow up: finishes straight away. */
const followUp = [
  "id: follow-up",
  "name: Follow up",
  "initial: done",
  "states:",
  "  done:",
  "    type: final",
  "",
].join("\n");

/** Starts Follow up at the top of every hour. */
const hourly = [
  "id: hourly-follow-up",
  "name: Hourly follow-up",
  "trigger: { every: 1h }",
  "run: { workflow: follow-up }",
  "",
].join("\n");

/** Friday digest, whose workflow the hub doesn't have: `halonic validate` reports its file. */
const brokenDigest = [
  "id: friday-digest",
  "name: Friday digest",
  "trigger: { every: 1h }",
  "run: { workflow: gone }",
  "",
].join("\n");

const digestPath = "hubs/support/workflows/routines/friday-digest.routine.yaml";

/** As in `watch.test.ts`: the first watch opens the engine from cold imports (HAL-5244). */
const slowWatch = { timeout: 10_000 };
const watchTestTimeout = 30_000;

let acmeRuns: AcmeRuns;
let running: { signals: ReturnType<typeof fakeSignals>; watching: Promise<number> } | undefined;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-watch-cant-start");
  await writeFiles(acmeRuns.acme, {
    "hubs/support/workflows/follow-up.workflow.yaml": followUp,
    "hubs/support/workflows/routines/hourly-follow-up.routine.yaml": hourly,
    [digestPath]: brokenDigest,
  });
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.watching.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

function startWatch(time: FakeTime) {
  const setup = acmeRunsSetup(acmeRuns);
  const command = routinesCommandWith({
    ...setup,
    engine: { ...setup.engine, clock: time.clock, setTimer: time.setTimer },
  });
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const watching = runCli(["routines", "watch"], io, [command], {
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, watching };
  return { io, signals, watching };
}

async function startedRoutines(): Promise<(string | undefined)[]> {
  const runs = await new RunHistory(
    await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile),
  ).listRuns();
  return runs.runs.map((run) => run.trigger?.routineId);
}

verifies("cli.commands.routines.watch", () => {
  // C565 row 1 (HAL-15372): one broken routine used to stop the watch for all of them.
  it("starts the other routines when one routine's file has errors, and says that one can't start", {
    timeout: watchTestTimeout,
  }, async () => {
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time);
    await waitUntil("the first watch lines", () => io.stdout.length === 2, slowWatch);
    expect(io.stdout).toEqual([
      "✕ Friday digest can't start until its file is fixed · halonic validate",
      "Watching 1 routine in Acme. Stop with Ctrl C.",
    ]);

    time.set("2026-11-10T15:00:10.000Z");
    await waitUntil("the started line", () => wokenUp(time) && io.stdout.length > 2, slowWatch);
    expect(io.stdout.slice(2)).toEqual([
      expect.stringMatching(/^✓ Started Hourly follow-up · run \w{6} · due 15:00$/u),
    ]);
    expect(await startedRoutines()).toEqual(["support/hourly-follow-up"]);

    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  // C610 #3 (HAL-15664): the fix used to go by without a line.
  it("starts a routine from the tick after its file is fixed, and says it can start now", {
    timeout: watchTestTimeout,
  }, async () => {
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time);
    await waitUntil("the first watch lines", () => io.stdout.length === 2, slowWatch);

    await writeFiles(acmeRuns.acme, {
      [digestPath]: brokenDigest.replace("workflow: gone", "workflow: follow-up"),
    });
    time.set("2026-11-10T15:00:10.000Z");
    await waitUntil("both started lines", () => wokenUp(time) && io.stdout.length > 4, slowWatch);
    expect(io.stdout.slice(2).sort()).toEqual([
      "✓ Friday digest can start now",
      expect.stringMatching(/^✓ Started Friday digest · run \w{6} · due 15:00$/u),
      expect.stringMatching(/^✓ Started Hourly follow-up · run \w{6} · due 15:00$/u),
    ]);

    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });
});
