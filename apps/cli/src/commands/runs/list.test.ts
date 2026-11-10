import { mkdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  done,
  makeAcmeRuns,
  now,
  removeAcmeRuns,
  running,
  type StoredRun,
  storeRuns as storeAcmeRuns,
  supportReply,
  waiting,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { runsCommandWith } from "./command.ts";

let acmeRuns: AcmeRuns;
let folder: string;
let acme: string;

const runsCommand = () =>
  runsCommandWith({ clock: () => ({ now, timeZone: "UTC" }), profile: acmeRuns.profile });

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-list");
  ({ folder, acme } = acmeRuns);
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

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
      ]);
      expect(io.stderr).toEqual([]);
    });

    it("never lists a test run", async () => {
      await storeRuns(done, { ...running, kind: "test" });

      const { io } = await runsIn(acme);

      expect(io.stdout).toEqual([
        "✓ Done   a1b2c3   Support reply   Sent nothing   10:31 · took 18 s",
      ]);
    });

    it("names a workflow that's gone by its id", async () => {
      await storeRuns({ ...done, workflowId: "mail-triage" });

      const { io } = await runsIn(acme);

      expect(io.stdout).toEqual([
        "✓ Done   a1b2c3   mail-triage   Sent nothing   10:31 · took 18 s",
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
      ]);
    });

    it("says how many runs --limit left out, and how to see them all", async () => {
      await storeRuns(done, waiting, running);

      const { io } = await runsIn(acme, "--limit", "1", "--status", "waiting");
      expect(io.stdout).toEqual([
        "! Needs you   09d9a0   Support reply   Waiting for you: Approve this reply?   10:40",
      ]);

      const cut = await runsIn(acme, "--limit", "1");
      expect(cut.io.stdout.at(-1)).toBe(
        "Showing the newest of 3 runs. See them all with halonic runs --limit 3.",
      );
    });

    it("lists the runs of one workflow, by its id or as hub/id", async () => {
      await storeRuns(done, { ...waiting, workflowId: "mail-triage" });

      for (const workflow of ["support-reply", "support/support-reply"]) {
        const { io } = await runsIn(acme, "--workflow", workflow);
        expect(io.stdout).toHaveLength(1);
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
        `No runs in acme yet. Start one with halonic run --dir .${sep}acme <workflow>.`,
      ]);
    });

    it("says there are only test runs, whatever the filters", async () => {
      await storeRuns({ ...done, kind: "test" });

      const { io } = await runsIn(acme, "--status", "failed");

      expect(io.stdout).toEqual([
        "No runs in acme yet, only test runs. Start one with halonic run <workflow>.",
      ]);
    });

    it("shows a bidi control in the workspace's folder name as its code", async () => {
      const shared = join(folder, "ac\u202eme");
      await writeFiles(shared, { "workspace.yaml": "id: acme\nname: Acme\n" });

      const { io } = await runsIn(shared);

      expect(io.stdout).toEqual([
        "No runs in ac\\u202eme yet. Start one with halonic run <workflow>.",
      ]);
    });

    it("says the filters match nothing, and how to see every run", async () => {
      await storeRuns(done);

      const { code, io } = await runsIn(acme, "--status", "failed", "--workflow", "support-reply");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "No failed runs of support-reply in acme.",
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
        '✕ There\'s no workflow called "suport-reply" in acme.',
        "  Did you mean support-reply?",
      ]);
    });

    it("points to Studio's Workflows page when no workflow is close", async () => {
      const { io } = await runsIn(acme, "--workflow", "billing");

      expect(io.stderr[1]).toBe("  See them in Studio's Workflows page.");
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
      ]);
      const noMatch = await runsIn(acme, "--workflow", "\u001b[31mgone", "--status", "failed");
      expect(noMatch.io.stdout[0]).toBe("No failed runs of \\u001b[31mgone in acme.");
      const workflow = await runsIn(acme, "--workflow", "\u001b[31mbilling");
      expect(workflow.io.stderr[0]).toBe(
        '✕ There\'s no workflow called "\\u001b[31mbilling" in acme.',
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
        "  Run it inside a workspace, or create one with halonic init.",
      ]);
    });
  });
});
