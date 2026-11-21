import { cp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  done,
  makeAcmeRuns,
  removeAcmeRuns,
  storeRuns,
  today,
  waiting,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { routinesCommandWith } from "./command.ts";

/** The Acme example, with its Weekly report routine on Mondays at 09:00. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const hint = "Routines start on time only while `halonic routines watch` is running.";
const golden = (name: string) => join(import.meta.dirname, "golden", name);
const problemsLine = (count: number) =>
  `! ${count} ${count === 1 ? "routine" : "routines"} can't start · halonic validate`;

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-list");
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const routinesCommand = () => routinesCommandWith(acmeRunsSetup(acmeRuns));

/** A routine of the support hub that runs Support reply, with its trigger and more lines. */
function routine(id: string, name: string, trigger: string, ...more: string[]): string {
  return [
    `id: ${id}`,
    `name: ${name}`,
    `trigger: ${trigger}`,
    "run: { workflow: support-reply }",
    ...more,
    "",
  ].join("\n");
}

async function addRoutines(routines: Readonly<Record<string, string>>): Promise<void> {
  const files = Object.fromEntries(
    Object.entries(routines).map(([id, text]) => [
      `hubs/support/workflows/routines/${id}.routine.yaml`,
      text,
    ]),
  );
  await writeFiles(acmeRuns.acme, files);
}

async function routinesIn(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(["routines", ...args], io, [routinesCommand()]);
  return { code, io };
}

/** A routine run of `support/<routineId>`, due at `at`. */
function triggeredBy(routineId: string, at: string) {
  return { type: "schedule" as const, routineId: `support/${routineId}`, at };
}

verifies("cli.commands.routines.list", () => {
  it("lists Acme's routines in every mode, as the golden file has them", async () => {
    const acme = join(acmeRuns.folder, "acme-example");
    await cp(acmeExample, acme, { recursive: true });
    const args = ["routines"];

    const output = await runGolden(args, () => [routinesCommand()], acme);

    expect(output.noColour.exit).toBe(exitCode.ok);
    expect(checklistProblems(output)).toEqual([]);
    expect(goldenText(args, output)).toBe(await readFile(golden("acme-routines.txt"), "utf8"));
  });

  it("names each routine's hub when two hubs have routines, as the golden file has them", async () => {
    const acme = join(acmeRuns.folder, "acme-example");
    await cp(acmeExample, acme, { recursive: true });
    await writeFiles(acme, {
      // Acme's Support reply reads input.mail first, so the routine gives it one.
      "hubs/support/workflows/routines/weekly-report.routine.yaml": routine(
        "weekly-report",
        "Weekly report",
        '{ schedule: "0 9 * * 5" }',
      ).replace("support-reply }", 'support-reply, input: { mail: "{{trigger.at}}" } }'),
    });
    const args = ["routines"];

    const output = await runGolden(args, () => [routinesCommand()], acme);

    expect(output.noColour.exit).toBe(exitCode.ok);
    expect(checklistProblems(output)).toEqual([]);
    expect(goldenText(args, output)).toBe(
      await readFile(golden("acme-routines-two-hubs.txt"), "utf8"),
    );
  });

  describe("each row", () => {
    it("gives a routine on a clock its next run, and one that never ran Never ran", async () => {
      await addRoutines({
        morning: routine("morning", "Morning check", '{ schedule: "0 8 * * *" }'),
      });

      const { code, io } = await routinesIn();

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Morning check   Daily at 08:00   Next tomorrow 08:00   Never ran",
        hint,
      ]);
    });

    it("writes a next run later today as its time", async () => {
      await addRoutines({ hourly: routine("hourly", "Hourly check", "{ every: 1h }") });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual(["Hourly check   Every hour (UTC)   Next 13:00   Never ran", hint]);
    });

    it("says Off for a routine that's off, whatever its trigger", async () => {
      await addRoutines({
        paused: routine("paused", "Paused check", "{ every: 15m }", "enabled: false"),
      });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual(["Paused check   Every 15 minutes   Off   Never ran", hint]);
    });

    it("lists a routine file that doesn't load with its error, never hiding it", async () => {
      await addRoutines({ broken: routine("broken", "Broken check", "{ every: 0m }") });

      const { code, io } = await routinesIn();

      expect(code).toBe(exitCode.failed);
      expect(io.stdout).toEqual([
        problemsLine(1),
        'broken   Invalid file, line 3: use a number and a unit, e.g. "15m", "1h", "1d" (runs are placed from midnight UTC)   ✕ Can\'t start   Never ran',
        hint,
      ]);
    });

    it("says Can't start for a routine whose file has errors, counts them above the list, and exits 1", async () => {
      await addRoutines({
        digest: [
          "id: digest",
          "name: Friday digest",
          'trigger: { schedule: "0 16 * * 5" }',
          "run: { workflow: weekly-digest }",
          "",
        ].join("\n"),
        morning: routine("morning", "Morning check", '{ schedule: "0 8 * * *" }'),
      });

      const { code, io } = await routinesIn("--dir", ".");

      // The support hub has no workflow weekly-digest, so the routine's start would fail.
      expect(code).toBe(exitCode.failed);
      expect(io.stdout).toEqual([
        "! 1 routine can't start · halonic validate --dir .",
        "Friday digest   Fridays at 16:00   ✕ Can't start         Never ran",
        "Morning check   Daily at 08:00     Next tomorrow 08:00   Never ran",
        hint,
      ]);
    });

    it("says Can't start for a routine whose input lacks a field the first step reads", async () => {
      await writeFiles(acmeRuns.acme, {
        "hubs/support/workflows/announce.workflow.yaml": [
          "id: announce",
          "name: Announce",
          "initial: write",
          "states:",
          "  write:",
          "    type: task",
          "    agent: writer",
          '    input: "Write an announcement about: {{input.topic}}"',
          "    on: [{ to: done, event: done }]",
          "  done: { type: final }",
          "",
        ].join("\n"),
        "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\nmodel: test\n",
      });
      await addRoutines({
        monday: [
          "id: monday",
          "name: Monday note",
          'trigger: { schedule: "0 8 * * 1" }',
          "run: { workflow: announce }",
          "",
        ].join("\n"),
      });

      const { code, io } = await routinesIn("--dir", ".");

      // C480 P5 (HAL-14777): the run would start with "Write an announcement about: ".
      expect(code).toBe(exitCode.failed);
      expect(io.stdout).toEqual([
        "! 1 routine can't start · halonic validate --dir .",
        "Monday note   Mondays at 08:00   ✕ Can't start   Never ran",
        hint,
      ]);
    });

    it("writes the next run of a schedule in its own time zone, and names the zone", async () => {
      await addRoutines({
        digest: routine(
          "digest",
          "Friday digest",
          '{ schedule: "0 16 * * 5", timezone: Europe/Amsterdam }',
        ),
      });

      const { code, io } = await routinesIn();

      // The test clock is in UTC: 16:00 in Amsterdam is 15:00 UTC, which the list doesn't show.
      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Friday digest   Fridays at 16:00 (Europe/Amsterdam)   Next 13 Nov 16:00 (Europe/Amsterdam)   Never ran",
        hint,
      ]);
    });

    it("says No set time for a routine no clock starts", async () => {
      await addRoutines({ manual: routine("manual", "By hand", "{ manual: true }") });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual(["By hand   Manual only   No set time   Never ran", hint]);
    });

    it("gives the last run its start and the runs list's status", async () => {
      await addRoutines({
        morning: routine("morning", "Morning check", '{ schedule: "0 8 * * *" }'),
      });
      await storeRuns(
        acmeRuns,
        { ...done, trigger: triggeredBy("morning", today("08:00:00")) },
        { ...waiting, trigger: triggeredBy("morning", today("08:00:00")) },
      );

      const { io } = await routinesIn();

      // The waiting run started at 10:40, after the finished one at 10:31.
      expect(io.stdout).toEqual([
        "Morning check   Daily at 08:00   Next tomorrow 08:00   Last 10:40 · ! Needs you",
        hint,
      ]);
    });

    it("lines the rows up in columns", async () => {
      await addRoutines({
        hourly: routine("hourly", "Hourly check", "{ every: 1h }"),
        manual: routine("manual", "By hand", "{ manual: true }"),
      });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual([
        "Hourly check   Every hour (UTC)   Next 13:00    Never ran",
        "By hand        Manual only        No set time   Never ran",
        hint,
      ]);
    });

    it("follows each name with its hub, so two of the same name can be told apart", async () => {
      await addRoutines({
        morning: routine("morning", "Morning check", '{ schedule: "0 8 * * *" }'),
      });
      await writeFiles(acmeRuns.acme, {
        "hubs/reports/hub.yaml": "id: reports\nname: Reports\n",
        "hubs/reports/workflows/weekly-report.workflow.yaml": [
          "id: weekly-report",
          "name: Weekly report",
          "initial: done",
          "states:",
          "  done:",
          "    type: final",
          "",
        ].join("\n"),
        "hubs/reports/workflows/routines/morning.routine.yaml": [
          "id: morning",
          "name: Morning check",
          "trigger: { manual: true }",
          "run: { workflow: weekly-report }",
          "",
        ].join("\n"),
      });

      const { code, io } = await routinesIn();

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Morning check · reports   Manual only      No set time           Never ran",
        "Morning check · support   Daily at 08:00   Next tomorrow 08:00   Never ran",
        hint,
      ]);
    });

    it("names no hub for a routine at the workspace's root", async () => {
      await addRoutines({ manual: routine("manual", "By hand", "{ manual: true }") });
      await writeFiles(acmeRuns.acme, {
        "workflows/routines/manual.routine.yaml": [
          "id: manual",
          "name: By hand",
          "trigger: { manual: true }",
          "run: { hub: support, workflow: support-reply }",
          "",
        ].join("\n"),
      });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual([
        "By hand · support   Manual only   No set time   Never ran",
        "By hand             Manual only   No set time   Never ran",
        hint,
      ]);
    });
  });

  it("says there are no routines yet, and exits 0", async () => {
    const { code, io } = await routinesIn();

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "No routines in Acme yet. Add one as workflows/routines/<id>.routine.yaml in a hub.",
    ]);
  });

  it("gives each routine's fields and its last run's id, status and start with --json", async () => {
    await addRoutines({
      morning: routine("morning", "Morning check", '{ schedule: "0 8 * * *" }'),
    });
    await storeRuns(acmeRuns, { ...done, trigger: triggeredBy("morning", today("08:00:00")) });

    const { code, io } = await routinesIn("--json");

    expect(code).toBe(exitCode.ok);
    expect(JSON.parse(io.stdout.join("\n"))).toEqual({
      outputVersion: 1,
      ok: true,
      routines: [
        {
          key: "support/morning",
          hubId: "support",
          routineId: "morning",
          name: "Morning check",
          enabled: true,
          trigger: "Daily at 08:00",
          nextRun: "2026-11-11T08:00:00.000Z",
          timeZone: null,
          problems: 0,
          lastRun: { runId: done.id, status: "completed", startedAt: done.start },
        },
      ],
    });
  });

  it("gives no next run with --json for a routine that can't start", async () => {
    await addRoutines({
      digest: routine("digest", "Friday digest", '{ schedule: "0 16 * * 5" }').replace(
        "support-reply",
        "weekly-digest",
      ),
    });

    const { code, io } = await routinesIn("--json");

    // C540 #4 (HAL-15082): the support hub has no workflow weekly-digest, so it never starts.
    expect(code).toBe(exitCode.failed);
    const [digest] = JSON.parse(io.stdout.join("\n")).routines;
    expect(digest).toMatchObject({ key: "support/digest", nextRun: null, problems: 1 });
  });

  it("lists the same routines as `routines list`", async () => {
    await addRoutines({
      morning: routine("morning", "Morning check", '{ schedule: "0 8 * * *" }'),
    });

    const listed = await routinesIn("list");

    // C540 #4 (HAL-15082): `list` gave "There's no command", as `plugin list` exists.
    expect(listed.code).toBe(exitCode.ok);
    expect(listed.io.stdout).toEqual((await routinesIn()).io.stdout);
  });

  it("stops in a folder without a workspace", async () => {
    const io = captureIo(acmeRuns.folder);

    const code = await runCli(["routines"], io, [routinesCommand()]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr[0]).toMatch(/^✕ Couldn't list the routines in /u);
  });
});
