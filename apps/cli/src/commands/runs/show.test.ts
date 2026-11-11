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
import { runsCommandWith } from "./command.ts";

let acmeRuns: AcmeRuns;
let acme: string;

const runsCommand = () => runsCommandWith(acmeRunsSetup(acmeRuns));

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-show");
  ({ acme } = acmeRuns);
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
        "✓ Read the email   Writer · default   1 s",
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
        "✓ Read the email   \\u001b[2JWriter · default   1 s",
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
        "  Answer in Studio's Inbox, or here: halonic runs send 09d9a0 approve (or reject)",
      ]);
    });

    it("writes the author's label after each answer that has one", async () => {
      await storeRuns({
        ...waiting,
        after: [
          [today("10:40:30"), { type: "state.entered", state: "review" }],
          [
            today("10:41:00"),
            {
              type: "run.waiting",
              state: "review",
              events: ["approve", "reject"],
              labels: { approve: "Send reply", reject: "Discard" },
            },
          ],
        ],
      });

      const { io } = await showIn(acme, "09d9a0");

      expect(io.stdout.at(-1)).toBe(
        "  Answer in Studio's Inbox, or here: halonic runs send 09d9a0 approve (Send reply) (or reject (Discard))",
      );
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

    it("leaves out a label that only repeats its event", async () => {
      await storeRuns({
        ...waiting,
        after: [
          [today("10:40:30"), { type: "state.entered", state: "review" }],
          [
            today("10:41:00"),
            {
              type: "run.waiting",
              state: "review",
              events: ["approve", "needs_changes"],
              labels: { approve: "Send it", needs_changes: "Needs changes" },
            },
          ],
        ],
      });

      const { io } = await showIn(acme, "09d9a0");

      expect(io.stdout.at(-1)).toBe(
        "  Answer in Studio's Inbox, or here: halonic runs send 09d9a0 approve (Send it) (or needs_changes)",
      );
    });

    it("ends a running run with the step it is in", async () => {
      await storeRuns(triaged("run_mfx3k2a1_0a0b0d", []));

      const { io } = await showIn(acme, "0a0b0d");

      expect(io.stdout).toEqual([
        "Mail triage in acme · run 0a0b0d · started 10:20, still running",
        "",
        "◌ Read the email   Writer · default · running since 10:20",
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

    it("ends a run that couldn't try every step with the steps it didn't run (HAL-4285)", async () => {
      const cantTry = {
        status: "cant-try",
        item: "hubs/support/workflows/mail-triage.workflow.yaml",
        step: "read",
        reason: { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" },
      } as const;
      await storeRuns(
        triage("run_mfx3k2a1_0f0f03", [
          [today("10:20:00"), { type: "state.entered", state: "read" }],
          [today("10:20:00"), { type: "run.cant-try", state: "read", cantTry: [cantTry] }],
        ]),
      );

      const { code, io } = await showIn(acme, "0f0f03");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout[0]).toMatch(/started 10:20, ended 10:20, couldn't try everything$/);
      expect(io.stdout.slice(-3)).toEqual([
        "! Mail triage couldn't try everything.",
        "  It didn't run Read the email: they need changes you haven't accepted yet.",
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
});
