import { mkdtempSync } from "node:fs";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  type StoredRun,
  storeRuns as storeAcmeRuns,
  today,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, heavyTestTimeout, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { runCommandWith } from "../run/command.ts";
import { runsCommandWith } from "./command.ts";

// `halonic runs show --output` (HAL-12073): what each agent step wrote.

/** The Acme example, on the test model: Support reply takes Sam's email down the refund path. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const golden = (name: string) => join(import.meta.dirname, "golden", name);

let acmeRuns: AcmeRuns;
let acme: string;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-show-output");
  ({ acme } = acmeRuns);
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const storeRuns = (...runs: readonly StoredRun[]) => storeAcmeRuns(acmeRuns, ...runs);

async function showIn(cwd: string, ...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const code = await runCli(["runs", "show", ...args], io, [
    runsCommandWith(acmeRunsSetup(acmeRuns)),
  ]);
  return { code, io };
}

/** Mail triage: Writer reads the email, then the run ends. */
const mailTriage = [
  "id: mail-triage",
  "name: Mail triage",
  "initial: read",
  "states:",
  "  read:",
  "    description: Read the email",
  "    agent: writer",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

verifies("cli.commands.runs.show", () => {
  describe("on the Acme example", () => {
    let folder: string;

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), "halonic-cli-runs-show-golden-"));
      await cp(acmeExample, join(folder, "acme"), { recursive: true });
    });

    afterEach(async () => {
      await removeTestFolder(folder);
    });

    it("shows what each step of a real run wrote, in every mode", {
      timeout: heavyTestTimeout,
    }, async () => {
      const home = mkdtempSync(join(folder, "profile-"));
      const profile: ProfileEnvironment = {
        ...nodeProfileEnvironment(),
        variables: { HALONIC_HOME: home },
      };
      const setup = testRunSetup(folder, profile);
      const cwd = join(folder, "acme");
      const ran = ["run", "support-reply", "--input", "examples/refund-question.json"];
      expect(
        await runCli([...ran, "--event", "approve"], captureIo(cwd), [runCommandWith(setup)]),
      ).toBe(exitCode.ok);

      const args = ["runs", "show", "01jd8q", "--output"];
      const output = await runGolden(args, () => [runsCommandWith(setup)], cwd);

      expect(output.noColour.exit).toBe(exitCode.ok);
      expect(checklistProblems(output)).toEqual([]);
      expect(goldenText(args, output)).toBe(
        await readFile(golden("support-reply-output.txt"), "utf8"),
      );
    });
  });

  describe("the steps of a Mail triage run", () => {
    const triaged = (id: string, after: NonNullable<StoredRun["after"]>): StoredRun => ({
      id,
      workflowId: "mail-triage",
      start: today("10:20:00"),
      after: [
        [today("10:20:00"), { type: "state.entered", state: "read" }],
        [today("10:20:00"), { type: "agent.started", state: "read", agent: "writer", prompt: "" }],
        ...after,
      ],
    });

    beforeEach(async () => {
      await writeFiles(acme, {
        "hubs/support/workflows/mail-triage.workflow.yaml": mailTriage,
        "hubs/support/agents/writer.agent.yaml":
          "id: writer\nname: Writer\ninstructions: Read it.\n",
      });
    });

    describe("--output (HAL-12073)", () => {
      /** A Mail triage run whose agent finished with `output`. */
      const triagedWith = (output: unknown): StoredRun =>
        triaged("run_mfx3k2a1_0a0b0c", [
          [today("10:20:01"), { type: "agent.finished", state: "read", agent: "writer", output }],
          [today("10:20:01"), { type: "state.entered", state: "done" }],
          [today("10:20:18"), { type: "run.completed", state: "done", context: {} }],
        ]);

      const heading = "Mail triage in Acme · run 0a0b0c · started 10:20, finished 10:20";
      const ending = ["", "✓ Mail triage finished in 18 s.", "  Sent nothing"];

      it("prints a string output under its step, line by line, indented two spaces", async () => {
        await storeRuns(triagedWith("Hi Sam,\n\nRefunds take 5 days."));

        const { io } = await showIn(acme, "0a0b0c", "--output");

        expect(io.stdout).toEqual([
          heading,
          "",
          "✓ Read the email   Writer · default   1 s",
          "  Hi Sam,",
          "",
          "  Refunds take 5 days.",
          ...ending,
        ]);
      });

      it("prints any other output as indented, pretty-printed JSON", async () => {
        await storeRuns(triagedWith({ topic: "refund", urgent: false }));

        const { io } = await showIn(acme, "0a0b0c", "--output");

        expect(io.stdout.slice(2, 7)).toEqual([
          "✓ Read the email   Writer · default   1 s",
          "  {",
          '    "topic": "refund",',
          '    "urgent": false',
          "  }",
        ]);
      });

      it("says so when the step finished with no output", async () => {
        await storeRuns(triagedWith(""));

        const { io } = await showIn(acme, "0a0b0c", "--output");

        expect(io.stdout).toEqual([
          heading,
          "",
          "✓ Read the email   Writer · default   1 s",
          "  No output.",
          ...ending,
        ]);
      });

      it("shows an escape code in an output as its code", async () => {
        await storeRuns(triagedWith("\u001b[2Jgone\u202e"));

        const { io } = await showIn(acme, "0a0b0c", "--output");

        expect(io.stdout[3]).toBe("  \\u001b[2Jgone\\u202e");
      });

      it("hints at --output under the receipt, with the user's --dir, only when a step wrote something", async () => {
        await storeRuns(triagedWith("Hi Sam"));
        const hinted = await showIn(acme, "0a0b0c");
        expect(hinted.io.stdout.slice(-2)).toEqual([
          "  Sent nothing",
          "  Output: halonic runs show 0a0b0c --output",
        ]);

        const elsewhere = await showIn(acmeRuns.folder, "0a0b0c", "--dir", `.${sep}acme`);
        expect(elsewhere.io.stdout.at(-1)).toBe(
          `  Output: halonic runs show --dir .${sep}acme 0a0b0c --output`,
        );

        const asked = await showIn(acme, "0a0b0c", "--output");
        expect(asked.io.stdout.join("\n")).not.toContain("Output:");
      });

      it("gives no hint for a run whose agents wrote nothing", async () => {
        await storeRuns(triagedWith(null));

        const { io } = await showIn(acme, "0a0b0c");

        expect(io.stdout.at(-1)).toBe("  Sent nothing");
      });
    });
  });
});
