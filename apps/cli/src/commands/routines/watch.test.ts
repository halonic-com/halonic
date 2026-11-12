import { RunHistory } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
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
import { waitUntil } from "../../test/wait-until.test-helper.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { routinesCommandWith } from "./command.ts";

/** Follow up: waits for a person, or moves on by itself after 5 minutes. */
const followUp = [
  "id: follow-up",
  "name: Follow up",
  "initial: wait",
  "states:",
  "  wait:",
  "    type: wait",
  "    description: Wait for an answer",
  "    on:",
  "      - to: done",
  "        event: answered",
  "      - to: done",
  "        event: no-answer",
  "        after: 5m",
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

/**
 * How long a wait for the watch's next line may take. The first watch in the
 * file opens the engine and its run store from cold imports, which took
 * longer than `vi.waitFor`'s 1 s on the Windows runner (HAL-5244).
 */
const slowWatch = { timeout: 10_000 };

/** Room for a few {@link slowWatch} waits in one test. */
const watchTestTimeout = 30_000;

let acmeRuns: AcmeRuns;

/** The watch the test started, which `afterEach` stops if the test failed before it did. */
let running: { signals: ReturnType<typeof fakeSignals>; watching: Promise<number> } | undefined;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-watch");
  await writeFiles(acmeRuns.acme, {
    "hubs/support/workflows/follow-up.workflow.yaml": followUp,
    "hubs/support/workflows/routines/hourly-follow-up.routine.yaml": hourly,
  });
});

afterEach(async () => {
  // A watch still open on the folder would make removing it fail with ENOTEMPTY,
  // on top of the test's own failure. A watch that already ended ignores the signal.
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.watching.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

function watchCommand(time: FakeTime) {
  const setup = acmeRunsSetup(acmeRuns);
  return routinesCommandWith({
    ...setup,
    engine: { ...setup.engine, clock: time.clock, setTimer: time.setTimer },
  });
}

/** Starts `routines watch` with the extra arguments, stopped by the signals it returns. */
function startWatch(time: FakeTime, ...args: string[]) {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const watching = runCli(["routines", "watch", ...args], io, [watchCommand(time)], {
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, watching };
  return { io, signals, watching };
}

async function storedRuns() {
  const runs = await new RunHistory(
    await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile),
  ).listRuns();
  return runs.runs;
}

verifies("cli.commands.routines.watch", () => {
  it("starts a routine when it's due and fires its run's timer, until Ctrl C", {
    timeout: watchTestTimeout,
  }, async () => {
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time);
    await waitUntil(() => io.stdout.length === 1, slowWatch);
    expect(io.stdout).toEqual(["Watching 1 routine in Acme. Stop with Ctrl C."]);

    // The next tick after 15:00 starts the run due at 15:00.
    time.set("2026-11-10T15:00:10.000Z");
    await waitUntil(() => wokenUp(time) && io.stdout.length > 1, slowWatch);
    expect(io.stdout[1]).toMatch(/^✓ Started Hourly follow-up · run \w{6} · due 15:00$/u);
    const [started] = await storedRuns();
    expect(started).toMatchObject({
      status: "waiting",
      trigger: { routineId: "support/hourly-follow-up", at: "2026-11-10T15:00:00.000Z" },
      nextTimer: "2026-11-10T15:05:10.000Z",
    });

    // Five minutes on, its timer moves it on by itself.
    time.set("2026-11-10T15:05:30.000Z");
    await waitUntil(
      async () => wokenUp(time) && (await storedRuns())[0]?.status === "completed",
      slowWatch,
    );
    const events = await (await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile)).events(
      started?.id ?? "",
    );
    expect(events.map((event) => event.type)).toContain("timer.fired");
    // With history off, the run reads the saved files, and records that it did.
    expect(events.find((event) => event.type === "run.started")).toMatchObject({
      version: { reads: "saved-files" },
    });

    signals.send("SIGINT");
    expect(await watching).toBe(130);
    expect(io.stderr).toEqual(["Stopped."]);
  });

  it("prints a ✕ line for a routine whose run didn't start, and keeps watching", {
    timeout: watchTestTimeout,
  }, async () => {
    // The local engine can't start an agent's run yet, though the routine's files are fine.
    await writeFiles(acmeRuns.acme, {
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Reply.\n",
      "hubs/support/workflows/routines/hourly-follow-up.routine.yaml": hourly.replace(
        "run: { workflow: follow-up }",
        "run: { agent: writer, prompt: Follow up on the open emails. }",
      ),
    });
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time, "--debug");
    await waitUntil(() => io.stdout.length === 1, slowWatch);
    expect(io.stdout).toHaveLength(1);

    time.set("2026-11-10T15:00:10.000Z");
    await waitUntil(() => wokenUp(time) && io.stdout.length > 1, slowWatch);
    expect(io.stdout[1]).toBe("✕ Hourly follow-up didn't start · due 15:00 · see why with --debug");
    expect(io.stderr.join("\n")).toContain("Routine support/hourly-follow-up didn't start:");
    expect(await storedRuns()).toEqual([]);

    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("ends with 143 at SIGTERM", { timeout: watchTestTimeout }, async () => {
    const { io, signals, watching } = startWatch(fakeTime(engineStart));
    await waitUntil(() => io.stdout.length === 1, slowWatch);
    expect(io.stdout).toHaveLength(1);

    signals.send("SIGTERM");

    expect(await watching).toBe(143);
  });

  it("refuses an untrusted workspace that reaches a real model, and writes nothing to the run log", async () => {
    await writeFiles(acmeRuns.acme, {
      "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
    });
    const io = captureIo(acmeRuns.acme);

    const code = await runCli(["routines", "watch"], io, [watchCommand(fakeTime(engineStart))]);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr).toContain(
      "✕ Couldn't watch the routines in acme: Acme isn't trusted on this computer yet. Nothing ran.",
    );
    expect(await storedRuns()).toEqual([]);
  });
});

verifies("cli.workspace-file-problems", () => {
  it("refuses to watch when the workspace's files have problems, and writes nothing to the run log", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/routines/hourly-follow-up.routine.yaml": hourly.replace(
        "workflow: follow-up",
        "workflow: gone",
      ),
    });
    const io = captureIo(acmeRuns.acme);

    const code = await runCli(["routines", "watch"], io, [watchCommand(fakeTime(engineStart))]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.slice(0, 2)).toEqual([
      "✕ Couldn't watch the routines in acme: Acme has 1 problem in its files. Nothing ran.",
      "  See them with: halonic validate",
    ]);
    expect(await storedRuns()).toEqual([]);
  });
});
