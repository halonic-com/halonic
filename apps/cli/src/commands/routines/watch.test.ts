import { RunHistory } from "@halonicjs/app";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  trustAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { type FakeTime, fakeTime, wokenUp } from "../../test/fake-time.ts";
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
    engine: {
      ...setup.engine,
      clock: time.clock,
      setTimer: time.setTimer,
      onWokeUp: time.onWokeUp,
    },
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
    await waitUntil("the first watch line", () => io.stdout.length === 1, slowWatch);
    expect(io.stdout).toEqual(["Watching 1 routine in Acme. Stop with Ctrl C."]);

    // The next tick after 15:00 starts the run due at 15:00.
    time.set("2026-11-10T15:00:10.000Z");
    await time.wakeAndSettle();
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
      "the woken-up run to complete",
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
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time, "--debug");
    await waitUntil("the first watch line", () => io.stdout.length === 1, slowWatch);
    expect(io.stdout).toHaveLength(1);
    // The routine's files stay fine, but the version due at 15:00 reaches a
    // model nobody trusted here, so its run doesn't start. (An agent on its
    // own did this before C672 #1; the watch now leaves that out up front.)
    await writeFiles(acmeRuns.acme, {
      "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
    });

    time.set("2026-11-10T15:00:10.000Z");
    await time.wakeAndSettle();
    expect(io.stdout[1]).toBe("✕ Hourly follow-up didn't start · due 15:00 · see why with --debug");
    expect(io.stderr.join("\n")).toContain("Routine support/hourly-follow-up didn't start:");
    expect(await storedRuns()).toEqual([]);

    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("says a webhook routine starts on a web request, which halonic serve receives", {
    timeout: watchTestTimeout,
  }, async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/routines/friday-digest.routine.yaml": [
        "id: friday-digest",
        "name: Friday digest",
        "trigger: { webhook: { secret: friday-hook } }",
        "run: { workflow: follow-up }",
        "",
      ].join("\n"),
    });
    const { io, signals, watching } = startWatch(fakeTime(engineStart));
    await waitUntil("the watch's first lines", () => io.stdout.length === 2, slowWatch);

    expect(io.stdout).toEqual([
      "Watching 1 routine in Acme. Stop with Ctrl C.",
      "Friday digest starts on a web request: run halonic serve for it.",
    ]);
    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("ends with 143 at SIGTERM", { timeout: watchTestTimeout }, async () => {
    const { io, signals, watching } = startWatch(fakeTime(engineStart));
    await waitUntil("the first watch line", () => io.stdout.length === 1, slowWatch);
    expect(io.stdout).toHaveLength(1);

    signals.send("SIGTERM");

    expect(await watching).toBe(143);
  });

  // C672 #1 (HAL-16096): it counted such a routine as watched, and its run failed when due.
  it("leaves out a routine that starts an agent on its own, says why, and starts the others", {
    timeout: watchTestTimeout,
  }, async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Reply.\n",
      "hubs/support/workflows/routines/daily-notes.routine.yaml": [
        "id: daily-notes",
        "name: Daily notes",
        "trigger: { every: 1m }",
        "run: { agent: writer, prompt: Write the notes. }",
        "",
      ].join("\n"),
    });
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time);
    await waitUntil("the first watch lines", () => io.stdout.length === 2, slowWatch);
    expect(io.stdout).toEqual([
      "✕ Daily notes can't start: Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the routine start that workflow.",
      "Watching 1 routine in Acme. Stop with Ctrl C.",
    ]);

    time.set("2026-11-10T15:00:10.000Z");
    await time.wakeAndSettle();
    expect(io.stdout.slice(2)).toEqual([
      expect.stringMatching(/^✓ Started Hourly follow-up · run \w{6} · due 15:00$/u),
    ]);
    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  // C570 #2 (HAL-15396): one routine whose agent is in Claude Code used to stop the watch for all of them.
  it("leaves out a routine whose one agent is in a harness, says why, and starts the others", {
    timeout: watchTestTimeout,
  }, async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\ninstructions: Reply.\nharness: claude-code\n",
      "hubs/support/workflows/routines/daily-notes.routine.yaml": [
        "id: daily-notes",
        "name: Daily notes",
        "trigger: { every: 1m }",
        "run: { agent: writer, prompt: Write the notes. }",
        "",
      ].join("\n"),
    });
    // Trust is the workspace's, and its agent in Claude Code is part of it, as `run` shows it.
    await trustAcmeRuns(acmeRuns);
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time);
    await waitUntil("the first watch lines", () => io.stdout.length === 2, slowWatch);
    // An agent on its own can't start in any harness, so that reason comes
    // first, as `halonic routines` gives it (C672 #1); the harness line is for
    // a workflow's agent, below.
    expect(io.stdout).toEqual([
      "✕ Daily notes can't start: Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the routine start that workflow.",
      "Watching 1 routine in Acme. Stop with Ctrl C.",
    ]);

    time.set("2026-11-10T15:00:10.000Z");
    await time.wakeAndSettle();
    expect(io.stdout.slice(2)).toEqual([
      expect.stringMatching(/^✓ Started Hourly follow-up · run \w{6} · due 15:00$/u),
    ]);
    expect((await storedRuns()).map((run) => run.trigger?.routineId)).toEqual([
      "support/hourly-follow-up",
    ]);

    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("leaves out a routine whose workflow has an agent in a harness, and starts nothing for it", {
    timeout: watchTestTimeout,
  }, async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\ninstructions: Reply.\nharness: claude-code\n",
      "hubs/support/workflows/follow-up.workflow.yaml": [
        "id: follow-up",
        "name: Follow up",
        "initial: write",
        "states:",
        "  write:",
        "    description: Write the follow-up",
        "    agent: writer",
        "    input: Follow up on the open emails.",
        "    on:",
        "      - to: done",
        "  done:",
        "    type: final",
        "",
      ].join("\n"),
    });
    await trustAcmeRuns(acmeRuns);
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time);
    await waitUntil("the first watch lines", () => io.stdout.length === 2, slowWatch);
    expect(io.stdout).toEqual([
      "✕ Hourly follow-up can't start: Writer runs in Claude Code, which routines can't start yet. Set Writer to Halonic on its Harness page, or turn the routine off.",
      "Watching 0 routines in Acme for now. Once a routine above can start, the watch starts it on time, so leave this running. Stop with Ctrl C.",
    ]);

    time.set("2026-11-10T15:00:10.000Z");
    await time.wakeAndSettle();
    expect(io.stdout).toHaveLength(2);
    expect(await storedRuns()).toEqual([]);

    signals.send("SIGINT");
    expect(await watching).toBe(130);
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
  // A routine's own file with errors leaves only that routine out (watch-cant-start.test.ts).
  it("refuses to watch when a file other than a routine's has problems, and writes nothing to the run log", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/spare.workflow.yaml": `version: 2\n${followUp.replace("id: follow-up", "id: spare")}`,
    });
    const io = captureIo(acmeRuns.acme);

    const code = await runCli(["routines", "watch"], io, [watchCommand(fakeTime(engineStart))]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.slice(0, 2)).toEqual([
      "✕ Couldn't watch the routines in acme: Acme has 1 problem in hubs/support/workflows/spare.workflow.yaml. Nothing ran.",
      "  See it with: halonic validate",
    ]);
    expect(await storedRuns()).toEqual([]);
  });
});
