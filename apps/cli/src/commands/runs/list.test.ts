import { mkdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
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
  running,
  type StoredRun,
  storeRuns as storeAcmeRuns,
  supportReply,
  today,
  waiting,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { runsCommandWith } from "./command.ts";

let acmeRuns: AcmeRuns;
let folder: string;
let acme: string;

const runsCommand = () => runsCommandWith(acmeRunsSetup(acmeRuns));

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-list");
  ({ folder, acme } = acmeRuns);
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** The list's last line in a month that spent nothing, in a workspace without `budget.monthly`. */
const nothingSpent =
  "Estimated spend this month: €0.00. To cap it, set budget.monthly in workspace.yaml or in Studio's Settings › Models.";

const golden = (name: string) => join(import.meta.dirname, "golden", name);

const storeRuns = (...runs: readonly StoredRun[]) => storeAcmeRuns(acmeRuns, ...runs);

async function runsIn(cwd: string, ...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const code = await runCli(["runs", ...args], io, [runsCommand()]);
  return { code, io };
}

verifies("cli.commands.runs.list", () => {
  describe("the list", () => {
    it("prints one lined-up row per run, newest first", async () => {
      await storeRuns(done, waiting, running);

      const { code, io } = await runsIn(acme);

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "◌ Running     09d9c0   Support reply   In Draft a reply                       10:53",
        "! Needs you   09d9a0   Support reply   Waiting for you: Approve this reply?   10:40",
        "✓ Done        a1b2c3   Support reply   Sent nothing                           10:31 · took 18 s",
        nothingSpent,
      ]);
      expect(io.stderr).toEqual([]);
    });

    it("never lists a test run", async () => {
      await storeRuns(done, { ...running, kind: "test" });

      const { io } = await runsIn(acme);

      expect(io.stdout).toEqual([
        "✓ Done   a1b2c3   Support reply   Sent nothing   10:31 · took 18 s",
        nothingSpent,
      ]);
    });

    it("names a workflow that's gone by its id", async () => {
      await storeRuns({ ...done, workflowId: "mail-triage" });

      const { io } = await runsIn(acme);

      expect(io.stdout).toEqual([
        "✓ Done   a1b2c3   mail-triage   Sent nothing   10:31 · took 18 s",
        nothingSpent,
      ]);
    });

    it("shows an escape code or a bidi control in the workflow's name as its code", async () => {
      await writeFiles(acme, {
        "hubs/support/workflows/support-reply.workflow.yaml": supportReply.replace(
          "name: Support reply",
          'name: "\\e[2J\\e[31mSupport\\u202e reply"',
        ),
      });
      await storeRuns(done);

      const { io } = await runsIn(acme);

      expect(io.stdout).toEqual([
        "✓ Done   a1b2c3   \\u001b[2J\\u001b[31mSupport\\u202e reply   Sent nothing   10:31 · took 18 s",
        nothingSpent,
      ]);
    });

    it("says how many runs --limit left out, and how to see them all", async () => {
      await storeRuns(done, waiting, running);

      const { io } = await runsIn(acme, "--limit", "1", "--status", "waiting");
      expect(io.stdout).toEqual([
        "! Needs you   09d9a0   Support reply   Waiting for you: Approve this reply?   10:40",
        nothingSpent,
      ]);

      const cut = await runsIn(acme, "--limit", "1");
      expect(cut.io.stdout.at(-2)).toBe(
        "Showing the newest of 3 runs. See them all with halonic runs --limit 3.",
      );
    });

    it("lists the runs of one workflow, by its id or as hub/id", async () => {
      await storeRuns(done, { ...waiting, workflowId: "mail-triage" });

      for (const workflow of ["support-reply", "support/support-reply"]) {
        const { io } = await runsIn(acme, "--workflow", workflow);
        expect(io.stdout).toHaveLength(2);
        expect(io.stdout[0]).toContain("a1b2c3");
      }
      const gone = await runsIn(acme, "--workflow", "mail-triage");
      expect(gone.code).toBe(exitCode.ok);
      expect(gone.io.stdout[0]).toContain("09d9a0");
    });

    it("gives the listed runs with their full ids, and how many match in all, with --json", async () => {
      await storeRuns(done, waiting, running);

      const { code, io } = await runsIn(acme, "--limit", "2", "--json");

      expect(code).toBe(exitCode.ok);
      const document = JSON.parse(io.stdout.join("\n"));
      expect(document).toMatchObject({ outputVersion: 1, ok: true, total: 3 });
      expect(document.runs.map((run: { id: string }) => run.id)).toEqual([running.id, waiting.id]);
    });
  });

  describe("an empty list", () => {
    it("says there are no runs yet, with the user's --dir", async () => {
      const { code, io } = await runsIn(folder, "--dir", "acme");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        `No runs in Acme yet. Start one with halonic run --dir .${sep}acme <workflow>.`,
      ]);
    });

    it("says there are only test runs, whatever the filters", async () => {
      await storeRuns({ ...done, kind: "test" });

      const { io } = await runsIn(acme, "--status", "failed");

      expect(io.stdout).toEqual([
        "No runs in Acme yet, only test runs. Start one with halonic run <workflow>.",
      ]);
    });

    it("shows a bidi control in the workspace's name as its code", async () => {
      const shared = join(folder, "shared");
      await writeFiles(shared, { "workspace.yaml": "id: acme\nname: Ac\u202eme\n" });

      const { io } = await runsIn(shared);

      expect(io.stdout).toEqual([
        "No runs in Ac\\u202eme yet. Start one with halonic run <workflow>.",
      ]);
    });

    it("says the filters match nothing, and how to see every run", async () => {
      await storeRuns(done);

      const { code, io } = await runsIn(acme, "--status", "failed", "--workflow", "support-reply");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "No failed runs of support-reply in Acme.",
        "  See every run with halonic runs.",
      ]);
    });
  });

  describe("wrong options", () => {
    it("suggests the --status the user meant", async () => {
      const { code, io } = await runsIn(acme, "--status", "done");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        '✕ --status takes running, waiting, completed or failed, and you gave "done".',
        "  Did you mean completed?",
      ]);
    });

    it("points to the help for a --status it can't guess", async () => {
      const { io } = await runsIn(acme, "--status", "purple");

      expect(io.stderr[1]).toBe("  Run halonic runs --help to see its options.");
    });

    it("refuses a --limit that isn't a whole number of 1 or more, with the usage line", async () => {
      for (const limit of ["0", "2.5", "-1", "ten"]) {
        const { code, io } = await runsIn(acme, `--limit=${limit}`);
        expect(code).toBe(exitCode.usage);
        expect(io.stderr[0]).toBe(
          `✕ --limit takes a whole number of 1 or more, and you gave "${limit}".`,
        );
        expect(io.stderr[1]).toContain("halonic runs [--status <status>]");
      }
    });

    it("says there's no such workflow, and suggests a close one", async () => {
      const { code, io } = await runsIn(acme, "--workflow", "suport-reply");

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr).toEqual([
        '✕ There\'s no workflow called "suport-reply" in Acme.',
        "  Did you mean support-reply?",
      ]);
    });

    it("lists the workflows when no workflow is close", async () => {
      const { io } = await runsIn(acme, "--workflow", "billing");

      expect(io.stderr[1]).toBe("  Workflows in Acme: support-reply.");
    });

    it("asks for the hub when two hubs have the workflow", async () => {
      await writeFiles(acme, {
        "hubs/sales/hub.yaml": "id: sales\nname: Sales\n",
        "hubs/sales/workflows/reply.workflow.yaml": supportReply.replace("support-reply", "reply"),
        "hubs/support/workflows/reply.workflow.yaml": supportReply.replace(
          "support-reply",
          "reply",
        ),
      });

      const { code, io } = await runsIn(acme, "--workflow", "reply");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        '✕ There\'s a workflow called "reply" in two hubs.',
        "  Name the hub: sales/reply or support/reply.",
      ]);
    });

    it("shows an escape code in what the user typed as its code", async () => {
      await storeRuns({ ...done, workflowId: "\u001b[31mgone" });

      const gone = await runsIn(acme, "--workflow", "\u001b[31mgone");
      expect(gone.io.stdout).toEqual([
        "✓ Done   a1b2c3   \\u001b[31mgone   Sent nothing   10:31 · took 18 s",
        nothingSpent,
      ]);
      const noMatch = await runsIn(acme, "--workflow", "\u001b[31mgone", "--status", "failed");
      expect(noMatch.io.stdout[0]).toBe("No failed runs of \\u001b[31mgone in Acme.");
      const workflow = await runsIn(acme, "--workflow", "\u001b[31mbilling");
      expect(workflow.io.stderr[0]).toBe(
        '✕ There\'s no workflow called "\\u001b[31mbilling" in Acme.',
      );
      const status = await runsIn(acme, "--status", "\u001b[31mfailed");
      expect(status.io.stderr[0]).toBe(
        '✕ --status takes running, waiting, completed or failed, and you gave "\\u001b[31mfailed".',
      );
      const limit = await runsIn(acme, "--limit", "\u001b[31m3");
      expect(limit.io.stderr[0]).toBe(
        '✕ --limit takes a whole number of 1 or more, and you gave "\\u001b[31m3".',
      );
    });

    it("says the folder holds no workspace", async () => {
      await mkdir(join(folder, "downloads"));
      await mkdir(join(folder, "down\u202eloads"));

      const shared = await runsIn(folder, "--dir", "down\u202eloads");
      expect(shared.io.stderr[0]).toBe(
        "✕ Couldn't list the runs in down\\u202eloads: there's no workspace.yaml here.",
      );

      const { code, io } = await runsIn(folder, "--dir", "downloads");

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr).toEqual([
        "✕ Couldn't list the runs in downloads: there's no workspace.yaml here.",
        "  Run it inside a workspace, create one with halonic init, or copy the example with halonic init --example acme.",
      ]);
    });
  });
});

/** A finished run of Support reply that started at `start` and made one model call priced at `cost`. */
function pricedRun(
  id: string,
  start: string,
  cost: number,
  kind: "run" | "test" = "run",
): StoredRun {
  return {
    id,
    start,
    kind,
    after: [
      [start, { type: "state.entered", state: "draft" }],
      [
        start,
        {
          type: "llm.response",
          agent: "writer",
          provider: "anthropic",
          model: "smart",
          usage: { inputTokens: 10, outputTokens: 10 },
          latencyMs: 900,
          text: "Hello",
          cost,
        },
      ],
      [start, { type: "run.completed", state: "draft", context: {} }],
    ],
  };
}

/** This month's runs cost €0.42; October's €5 and a test run's €9 don't count. */
const monthOfRuns: readonly StoredRun[] = [
  pricedRun("run_mfx3k2a1_0c7b31", "2026-10-31T23:59:00.000Z", 5),
  pricedRun("run_mfx3k2a1_e1d2c3", "2026-11-01T00:00:00.000Z", 0.3),
  pricedRun("run_mfx3k2a1_f4e5d6", today("09:15:00"), 0.12),
  pricedRun("run_mfx3k2a1_a7b8c9", today("09:30:00"), 9, "test"),
];

const workspaceWith = (budget: string) => `id: acme\nname: Acme\nbudget:\n${budget}`;

verifies("cli.commands.runs.month-spend", () => {
  it("ends with this month's estimated spend out of budget.monthly, after the cut-off line, as the golden file has it", async () => {
    await writeFiles(acme, { "workspace.yaml": workspaceWith("  monthly: 20\n") });
    await storeRuns(...monthOfRuns);
    const args = ["runs", "--limit", "1"];

    const output = await runGolden(args, () => [runsCommand()], acme);

    expect(output.noColour.exit).toBe(exitCode.ok);
    expect(checklistProblems(output)).toEqual([]);
    expect(goldenText(args, output)).toBe(await readFile(golden("month-spend.txt"), "utf8"));
  });

  it("says how to cap the month without budget.monthly", async () => {
    await storeRuns(...monthOfRuns);

    const { io } = await runsIn(acme);

    expect(io.stdout.at(-1)).toBe(
      "Estimated spend this month: about €0.42. To cap it, set budget.monthly in workspace.yaml or in Studio's Settings › Models.",
    );
  });

  it("counts the whole month whatever --status, --workflow and --limit show", async () => {
    await writeFiles(acme, { "workspace.yaml": workspaceWith("  monthly: 20\n") });
    await storeRuns(...monthOfRuns, waiting, running);

    const { io } = await runsIn(
      acme,
      "--status",
      "waiting",
      "--workflow",
      "support-reply",
      "--limit",
      "1",
    );

    expect(io.stdout).toEqual([
      "! Needs you   09d9a0   Support reply   Waiting for you: Approve this reply?   10:40",
      "Estimated spend this month: about €0.42 of your €20.00 budget.",
    ]);
  });

  it("writes both amounts in budget.currency", async () => {
    await writeFiles(acme, { "workspace.yaml": workspaceWith("  monthly: 15\n  currency: USD\n") });
    await storeRuns(...monthOfRuns);

    const { io } = await runsIn(acme);

    expect(io.stdout.at(-1)).toBe("Estimated spend this month: about $0.42 of your $15.00 budget.");
  });

  it("isn't about anything when the month spent nothing or less than the money rule shows", async () => {
    await storeRuns(pricedRun("run_mfx3k2a1_b0b0b0", today("08:00:00"), 0.0002));

    const { io } = await runsIn(acme);

    expect(io.stdout.at(-1)).toBe(
      "Estimated spend this month: under €0.001. To cap it, set budget.monthly in workspace.yaml or in Studio's Settings › Models.",
    );
  });

  it("adds no line to an empty list", async () => {
    await storeRuns({ ...monthOfRuns[1], kind: "test" } as StoredRun);

    const { io } = await runsIn(acme);

    expect(io.stdout).toEqual([
      "No runs in Acme yet, only test runs. Start one with halonic run <workflow>.",
    ]);
  });
});
