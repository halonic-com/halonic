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
  today,
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
  acmeRuns = await makeAcmeRuns("runs-show");
  ({ folder, acme } = acmeRuns);
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const storeRuns = (...runs: readonly StoredRun[]) => storeAcmeRuns(acmeRuns, ...runs);

async function showIn(cwd: string, ...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const code = await runCli(["runs", "show", ...args], io, [runsCommand()]);
  return { code, io };
}

/** A run that failed yesterday at 16:41, in its first step. */
const failedYesterday: StoredRun = {
  id: "run_mfx2z9q0_01jd6m",
  start: "2026-11-09T16:40:00.000Z",
  after: [
    ["2026-11-09T16:40:01.000Z", { type: "state.entered", state: "draft" }],
    [
      "2026-11-09T16:41:00.000Z",
      { type: "run.failed", state: "draft", error: "model-no-tools", reason: "error" },
    ],
  ],
};

verifies("cli.commands.runs.show", () => {
  describe("the heading", () => {
    it("says which run, when it started and how it ended", async () => {
      await storeRuns(done, failedYesterday);

      const finished = await showIn(acme, "a1b2c3");
      expect(finished.code).toBe(exitCode.ok);
      expect(finished.io.stdout[0]).toBe(
        "Support reply in acme · run a1b2c3 · started 10:31, finished 10:31",
      );

      const failed = await showIn(acme, "01jd6m");
      expect(failed.code).toBe(exitCode.ok);
      expect(failed.io.stdout[0]).toBe(
        "Support reply in acme · run 01jd6m · started yesterday 16:40, failed yesterday 16:41",
      );
      expect(failed.io.stderr).toEqual([]);
    });

    it("says since when a waiting run waits, and that a running run still runs", async () => {
      await storeRuns(waiting, running);

      const { io } = await showIn(acme, "09d9a0");
      expect(io.stdout[0]).toBe(
        "Support reply in acme · run 09d9a0 · started 10:40, waiting for you since 10:41",
      );

      const still = await showIn(acme, "09d9c0");
      expect(still.io.stdout[0]).toBe(
        "Support reply in acme · run 09d9c0 · started 10:53, still running",
      );
    });

    it("shows a test run, and says it is one", async () => {
      await storeRuns({ ...done, kind: "test" });

      const { io } = await showIn(acme, "a1b2c3");

      expect(io.stdout[0]).toBe(
        "Support reply in acme · test run a1b2c3 · started 10:31, finished 10:31",
      );
    });
  });

  describe("the steps and the receipt", () => {
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

    it("prints a finished run as a finished halonic run ends", async () => {
      await storeRuns(
        triaged("run_mfx3k2a1_0a0b0c", [
          [today("10:20:01"), { type: "state.entered", state: "done" }],
          [today("10:20:18"), { type: "run.completed", state: "done", context: {} }],
        ]),
      );

      const { code, io } = await showIn(acme, "0a0b0c");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Mail triage in acme · run 0a0b0c · started 10:20, finished 10:20",
        "",
        "✓ Read the email   Writer   1 s",
        "",
        "✓ Mail triage finished in 18 s.",
        "  Sent nothing",
      ]);
    });

    it("shows an escape code or a bidi control in the workflow's or the agent's name as its code", async () => {
      await writeFiles(acme, {
        "hubs/support/workflows/mail-triage.workflow.yaml": mailTriage.replace(
          "name: Mail triage",
          'name: "\\e[31mMail\\u202e triage"',
        ),
        "hubs/support/agents/writer.agent.yaml":
          'id: writer\nname: "\\e[2JWriter"\ninstructions: Read it.\n',
      });
      await storeRuns(
        triaged("run_mfx3k2a1_0a0b0c", [
          [today("10:20:01"), { type: "state.entered", state: "done" }],
          [today("10:20:18"), { type: "run.completed", state: "done", context: {} }],
        ]),
      );

      const { io } = await showIn(acme, "0a0b0c");

      expect(io.stdout).toEqual([
        "\\u001b[31mMail\\u202e triage in acme · run 0a0b0c · started 10:20, finished 10:20",
        "",
        "✓ Read the email   \\u001b[2JWriter   1 s",
        "",
        "✓ \\u001b[31mMail\\u202e triage finished in 18 s.",
        "  Sent nothing",
      ]);
    });

    it("ends a run waiting at a wait step with run's two waiting lines, and no receipt", async () => {
      await storeRuns(waiting);

      const { io } = await showIn(acme, "09d9a0");

      expect(io.stdout).toEqual([
        "Support reply in acme · run 09d9a0 · started 10:40, waiting for you since 10:41",
        "",
        "! Approve this reply?   waiting for you since 10:41",
        "",
        "! Waiting for you: Approve this reply?",
        "  Answer in Studio's Inbox.",
      ]);
    });

    it("shows an escape code or a bidi control in the wait step's description as its code", async () => {
      await writeFiles(acme, {
        "hubs/support/workflows/support-reply.workflow.yaml": supportReply.replace(
          "description: Approve this reply?",
          'description: "\\e[2J\\e[31mApprove\\u202e this reply?"',
        ),
      });
      await storeRuns(waiting);

      const { io } = await showIn(acme, "09d9a0");

      expect(io.stdout.slice(2, 5)).toEqual([
        "! \\u001b[2J\\u001b[31mApprove\\u202e this reply?   waiting for you since 10:41",
        "",
        "! Waiting for you: \\u001b[2J\\u001b[31mApprove\\u202e this reply?",
      ]);
    });

    it("ends a running run with the step it is in", async () => {
      await storeRuns(triaged("run_mfx3k2a1_0a0b0d", []));

      const { io } = await showIn(acme, "0a0b0d");

      expect(io.stdout).toEqual([
        "Mail triage in acme · run 0a0b0d · started 10:20, still running",
        "",
        "◌ Read the email   Writer · running since 10:20",
      ]);
    });
  });

  describe("a failed or stopped run", () => {
    /** Mail triage: Writer reads the email with the local model, then the run ends. */
    const mailTriage = [
      "id: mail-triage",
      "name: Mail triage",
      "initial: read",
      "states:",
      "  read:",
      "    description: Read the email",
      "    agent: writer",
      "    on:",
      "      - to: classify",
      "  classify:",
      "    agent: writer",
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "",
    ].join("\n");

    const triage = (id: string, after: NonNullable<StoredRun["after"]>): StoredRun => ({
      id,
      workflowId: "mail-triage",
      start: today("10:20:00"),
      after,
    });

    const enteredRead: NonNullable<StoredRun["after"]> = [
      [today("10:20:00"), { type: "state.entered", state: "read" }],
      [today("10:20:00"), { type: "agent.started", state: "read", agent: "writer", prompt: "" }],
    ];

    beforeEach(async () => {
      await writeFiles(acme, {
        "models.yaml": "aliases:\n  local:\n    provider: ollama\n    model: llama3.2\n",
        "providers/ollama.yaml": "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n",
        "hubs/support/workflows/mail-triage.workflow.yaml": mailTriage,
        "hubs/support/agents/writer.agent.yaml":
          "id: writer\nname: Writer\nmodel: local\ninstructions: Read it.\n",
      });
    });

    it("ends with run's two failure lines and the receipt, on stdout, exit 0", async () => {
      await storeRuns(
        triage("run_mfx3k2a1_0f0f01", [
          ...enteredRead,
          [
            today("10:20:01"),
            {
              type: "llm.request",
              agent: "writer",
              provider: "ollama",
              model: "llama3.2",
              messages: 1,
            },
          ],
          [
            today("10:20:02"),
            {
              type: "run.failed",
              state: "read",
              error: "model llama3.2 not found",
              reason: "model-missing",
            },
          ],
        ]),
      );

      const { code, io } = await showIn(acme, "0f0f01");

      expect(code).toBe(exitCode.ok);
      expect(io.stderr).toEqual([]);
      expect(io.stdout.slice(-3)).toEqual([
        "✕ Mail triage failed in the step Read the email: Ollama is answering, but it doesn't have llama3.2 yet.",
        "  Run ollama pull llama3.2, or point the model alias local at another model in models.yaml.",
        "  Sent nothing",
      ]);
    });

    it("gives a reason it can't name the general lines, with the engine's message", async () => {
      await storeRuns(
        triage("run_mfx3k2a1_0f0f02", [
          ...enteredRead,
          [
            today("10:20:02"),
            { type: "run.failed", state: "read", error: "the bank is offline", reason: "error" },
          ],
        ]),
      );

      const { io } = await showIn(acme, "0f0f02");

      expect(io.stdout.at(-3)).toBe(
        "✕ Mail triage failed in the step Read the email. Halonic can't tell the cause yet: the bank is offline.",
      );
    });

    it("says where a cancel landed: in a step, between steps, or before any", async () => {
      const cancelled = (state: string | null) =>
        ({ type: "run.failed", state, error: "cancelled", reason: "cancelled" }) as const;
      await storeRuns(
        triage("run_mfx3k2a1_0c0c01", [...enteredRead, [today("10:20:05"), cancelled("read")]]),
        triage("run_mfx3k2a1_0c0c02", [
          ...enteredRead,
          [today("10:20:04"), { type: "transition", from: "read", to: "classify", event: "" }],
          [today("10:20:05"), cancelled("classify")],
        ]),
        triage("run_mfx3k2a1_0c0c03", [[today("10:20:05"), cancelled(null)]]),
      );

      const endOf = async (id: string) => (await showIn(acme, id)).io.stdout.slice(-2);

      expect(await endOf("0c0c01")).toEqual([
        "✕ Mail triage was cancelled in the step Read the email. Nothing after it ran.",
        "  Sent nothing",
      ]);
      expect(await endOf("0c0c02")).toEqual([
        "✕ Mail triage was cancelled before the step Classify. Nothing after it ran.",
        "  Sent nothing",
      ]);
      expect(await endOf("0c0c03")).toEqual([
        "✕ Mail triage was cancelled before it started.",
        "  Sent nothing",
      ]);
    });
  });

  describe("which run", () => {
    it("takes the short id in any case, or the full id", async () => {
      await storeRuns(done);

      for (const typed of ["A1B2C3", done.id, done.id.toUpperCase()]) {
        const { code, io } = await showIn(acme, typed);
        expect(code).toBe(exitCode.ok);
        expect(io.stdout[0]).toContain("run a1b2c3");
      }
    });

    it("says there's no such run, and points to the list with the user's --dir", async () => {
      await storeRuns(done);

      const { code, io } = await showIn(folder, "01jd8x", "--dir", "acme");

      expect(code).toBe(exitCode.notFound);
      expect(io.stdout).toEqual([]);
      expect(io.stderr).toEqual([
        "✕ There's no run 01jd8x in acme.",
        `  See recent runs with halonic runs --dir .${sep}acme.`,
      ]);
    });

    it("asks for the full id when two runs end in the same short id", async () => {
      await storeRuns(done, { ...waiting, id: "run_mfx3k2a2_a1b2c3" });

      const { code, io } = await showIn(acme, "A1B2C3");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        "✕ Two runs in acme end in a1b2c3.",
        "  Use the full id, as halonic runs --json shows it.",
      ]);
    });

    it("takes exactly one run id", async () => {
      const none = await showIn(acme);
      expect(none.code).toBe(exitCode.usage);
      expect(none.io.stderr).toEqual([
        "✕ halonic runs show needs a run id.",
        "  Usage: halonic runs show <run-id> [--dir <folder>]",
      ]);

      const two = await showIn(acme, "a1b2c3", "09d9a0");
      expect(two.io.stderr[0]).toBe(
        "✕ halonic runs show takes one run id, and you gave two: a1b2c3, 09d9a0.",
      );
    });

    it("shows an escape code in the id the user typed, or a bidi control in the folder name, as its code", async () => {
      const shared = join(folder, "ac\u202eme");
      await writeFiles(shared, { "workspace.yaml": "id: acme\nname: Acme\n" });
      await storeAcmeRuns({ ...acmeRuns, acme: shared }, done);

      const heading = await showIn(shared, "a1b2c3");
      expect(heading.io.stdout[0]).toBe(
        "support-reply in ac\\u202eme · run a1b2c3 · started 10:31, finished 10:31",
      );
      const missing = await showIn(shared, "01jd8x");
      expect(missing.io.stderr[0]).toBe("✕ There's no run 01jd8x in ac\\u202eme.");
      const two = await showIn(acme, "\u001b[31ma1b2c3", "09d9a0");
      expect(two.io.stderr[0]).toBe(
        "✕ halonic runs show takes one run id, and you gave two: \\u001b[31ma1b2c3, 09d9a0.",
      );
      await mkdir(join(folder, "downloads"));
      const nowhere = await showIn(folder, "\u001b[31ma1b2c3", "--dir", "downloads");
      expect(nowhere.io.stderr[0]).toBe(
        "✕ Couldn't show run \\u001b[31ma1b2c3: there's no workspace.yaml here.",
      );
    });

    it("says the folder holds no workspace", async () => {
      await mkdir(join(folder, "downloads"));

      const { code, io } = await showIn(folder, "a1b2c3", "--dir", "downloads");

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr[0]).toBe("✕ Couldn't show run a1b2c3: there's no workspace.yaml here.");
    });
  });

  describe("--json", () => {
    it("gives the run's events, oldest first, with the full id", async () => {
      await storeRuns(done);

      const { code, io } = await showIn(acme, "a1b2c3", "--json");

      expect(code).toBe(exitCode.ok);
      const output = JSON.parse(io.stdout.join("\n")) as {
        events: { type: string; runId: string; at: string }[];
      };
      expect(output.events.map((event) => event.type)).toEqual([
        "run.started",
        "state.entered",
        "run.completed",
      ]);
      expect(output.events.every((event) => event.runId === done.id)).toBe(true);
      expect(output.events[0]?.at).toBe(today("10:31:00"));
    });
  });
});
