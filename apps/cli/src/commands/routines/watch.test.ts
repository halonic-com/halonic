import { RunHistory } from "@halonicjs/app";
import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
import { engineStart } from "../../test/run-setup.ts";
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

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-watch");
  await writeFiles(acmeRuns.acme, {
    "hubs/support/workflows/follow-up.workflow.yaml": followUp,
    "hubs/support/workflows/routines/hourly-follow-up.routine.yaml": hourly,
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/**
 * The engine's time, moved by hand, and its wake-ups, which only go off
 * when the test calls {@link FakeTime.wake}: no real timer runs.
 */
interface FakeTime {
  readonly clock: Clock;
  set(iso: string): void;
  /** Calls every wake-up the scheduler has set, as if its delay had passed. */
  wake(): void;
  setTimer(callback: () => void, delayMs: number): () => void;
}

function fakeTime(start: number): FakeTime {
  let now = start;
  let wakeUps = new Set<() => void>();
  return {
    clock: { now: () => new Date(now) },
    set: (iso) => {
      now = Date.parse(iso);
    },
    wake: () => {
      const due = wakeUps;
      wakeUps = new Set();
      for (const callback of due) callback();
    },
    setTimer: (callback) => {
      wakeUps.add(callback);
      return () => wakeUps.delete(callback);
    },
  };
}

/**
 * Calls the scheduler's wake-ups, for a `vi.waitFor` check: the scheduler
 * sets its first one once it has read its timers, so each try wakes it again.
 */
function wokenUp(time: FakeTime): true {
  time.wake();
  return true;
}

function watchCommand(time: FakeTime) {
  const setup = acmeRunsSetup(acmeRuns);
  return routinesCommandWith({
    ...setup,
    engine: { ...setup.engine, clock: time.clock, setTimer: time.setTimer },
  });
}

async function storedRuns() {
  const runs = await new RunHistory(
    await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile),
  ).listRuns();
  return runs.runs;
}

verifies("cli.commands.routines.watch", () => {
  it("starts a routine when it's due and fires its run's timer, until Ctrl C", async () => {
    const time = fakeTime(engineStart);
    const io = captureIo(acmeRuns.acme);
    const signals = fakeSignals();
    const watching = runCli(["routines", "watch"], io, [watchCommand(time)], {
      stop: { signals, exitNow: () => undefined },
    });
    await vi.waitFor(() =>
      expect(io.stdout).toEqual(["Watching 1 routine in acme. Stop with Ctrl C."]),
    );

    // The next tick after 15:00 starts the run due at 15:00.
    time.set("2026-11-10T15:00:10.000Z");
    await vi.waitFor(
      () =>
        wokenUp(time) &&
        expect(io.stdout[1]).toMatch(/^✓ Started Hourly follow-up · run \w{6} · due 15:00$/u),
    );
    const [started] = await storedRuns();
    expect(started).toMatchObject({
      status: "waiting",
      trigger: { routineId: "support/hourly-follow-up", at: "2026-11-10T15:00:00.000Z" },
      nextTimer: "2026-11-10T15:05:10.000Z",
    });

    // Five minutes on, its timer moves it on by itself.
    time.set("2026-11-10T15:05:30.000Z");
    await vi.waitFor(
      async () => wokenUp(time) && expect((await storedRuns())[0]?.status).toBe("completed"),
    );
    const events = await (await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile)).events(
      started?.id ?? "",
    );
    expect(events.map((event) => event.type)).toContain("timer.fired");

    signals.send("SIGINT");
    expect(await watching).toBe(130);
    expect(io.stderr).toEqual(["Stopped."]);
  });

  it("prints a ✕ line for a routine whose run didn't start, and keeps watching", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/routines/hourly-follow-up.routine.yaml": hourly.replace(
        "workflow: follow-up",
        "workflow: gone",
      ),
    });
    const time = fakeTime(engineStart);
    const io = captureIo(acmeRuns.acme);
    const signals = fakeSignals();
    const watching = runCli(["routines", "watch", "--debug"], io, [watchCommand(time)], {
      stop: { signals, exitNow: () => undefined },
    });
    await vi.waitFor(() => expect(io.stdout).toHaveLength(1));

    time.set("2026-11-10T15:00:10.000Z");
    await vi.waitFor(
      () =>
        wokenUp(time) &&
        expect(io.stdout[1]).toBe(
          "✕ Hourly follow-up didn't start · due 15:00 · see why with --debug",
        ),
    );
    expect(io.stderr.join("\n")).toContain("Routine support/hourly-follow-up didn't start:");
    expect(await storedRuns()).toEqual([]);

    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("ends with 143 at SIGTERM", async () => {
    const time = fakeTime(engineStart);
    const io = captureIo(acmeRuns.acme);
    const signals = fakeSignals();
    const watching = runCli(["routines", "watch"], io, [watchCommand(time)], {
      stop: { signals, exitNow: () => undefined },
    });
    await vi.waitFor(() => expect(io.stdout).toHaveLength(1));

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
