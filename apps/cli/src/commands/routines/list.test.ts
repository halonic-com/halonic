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
const golden = (name: string) => join(import.meta.dirname, "golden", name);

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
      "hubs/support/workflows/routines/weekly-report.routine.yaml": routine(
        "weekly-report",
        "Weekly report",
        '{ schedule: "0 9 * * 5" }',
      ),
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
      ]);
    });

    it("writes a next run later today as its time", async () => {
      await addRoutines({ hourly: routine("hourly", "Hourly check", "{ every: 1h }") });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual(["Hourly check   Every hour (UTC)   Next 13:00   Never ran"]);
    });

    it("says Off for a routine that's off, whatever its trigger", async () => {
      await addRoutines({
        paused: routine("paused", "Paused check", "{ every: 15m }", "enabled: false"),
      });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual(["Paused check   Every 15 minutes   Off   Never ran"]);
    });

    it("says No set time for a routine no clock starts", async () => {
      await addRoutines({ manual: routine("manual", "By hand", "{ manual: true }") });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual(["By hand   Manual only   No set time   Never ran"]);
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
      ]);
    });

    it("follows each name with its hub, so two of the same name can be told apart", async () => {
      await addRoutines({
        morning: routine("morning", "Morning check", '{ schedule: "0 8 * * *" }'),
      });
      await writeFiles(acmeRuns.acme, {
        "hubs/reports/workflows/routines/morning.routine.yaml": routine(
          "morning",
          "Morning check",
          "{ manual: true }",
        ),
      });

      const { code, io } = await routinesIn();

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Morning check reports   Manual only      No set time           Never ran",
        "Morning check support   Daily at 08:00   Next tomorrow 08:00   Never ran",
      ]);
    });

    it("names no hub for a routine at the workspace's root", async () => {
      await addRoutines({ manual: routine("manual", "By hand", "{ manual: true }") });
      await writeFiles(acmeRuns.acme, {
        "workflows/routines/manual.routine.yaml": routine("manual", "By hand", "{ manual: true }"),
      });

      const { io } = await routinesIn();

      expect(io.stdout).toEqual([
        "By hand support   Manual only   No set time   Never ran",
        "By hand           Manual only   No set time   Never ran",
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
          lastRun: { runId: done.id, status: "completed", startedAt: done.start },
        },
      ],
    });
  });

  it("stops in a folder without a workspace", async () => {
    const io = captureIo(acmeRuns.folder);

    const code = await runCli(["routines"], io, [routinesCommand()]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr[0]).toMatch(/^✕ Couldn't list the routines in /u);
  });
});
