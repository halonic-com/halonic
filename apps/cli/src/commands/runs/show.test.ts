import type { RunEventBody } from "@halonicjs/events";
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
        "Support reply in Acme · run a1b2c3 · started 10:31, finished 10:31",
      );

      const failed = await showIn(acme, "01jd6m");
      expect(failed.code).toBe(exitCode.ok);
      expect(failed.io.stdout[0]).toBe(
        "Support reply in Acme · run 01jd6m · started yesterday 16:40, failed yesterday 16:41",
      );
      expect(failed.io.stderr).toEqual([]);
    });

    it("says since when a waiting run waits, and that a running run still runs", async () => {
      await storeRuns(waiting, running);

      const { io } = await showIn(acme, "09d9a0");
      expect(io.stdout[0]).toBe(
        "Support reply in Acme · run 09d9a0 · started 10:40, waiting for you since 10:41",
      );

      const still = await showIn(acme, "09d9c0");
      expect(still.io.stdout[0]).toBe(
        "Support reply in Acme · run 09d9c0 · started 10:53, still running",
      );
    });

    it("shows a test run, and says it is one", async () => {
      await storeRuns({ ...done, kind: "test" });

      const { io } = await showIn(acme, "a1b2c3");

      expect(io.stdout[0]).toBe(
        "Support reply in Acme · test run a1b2c3 · started 10:31, finished 10:31",
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
        "Mail triage in Acme · run 0a0b0c · started 10:20, finished 10:20",
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
        "\\u001b[31mMail\\u202e triage in Acme · run 0a0b0c · started 10:20, finished 10:20",
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
        "Support reply in Acme · run 09d9a0 · started 10:40, waiting for you since 10:41",
        "",
        "! Approve this reply?   waiting for you since 10:41",
        "",
        "! Waiting for you: Approve this reply?",
        "  Answer with: halonic runs send 09d9a0 approve (or reject)",
      ]);
    });

    it("ends a run waiting for a tool approval with who wants which tool, and how to answer (HAL-7937)", async () => {
      await storeRuns({
        ...waiting,
        after: [
          [today("10:40:30"), { type: "state.entered", state: "draft" }],
          [
            today("10:41:00"),
            {
              type: "approval.requested",
              state: "draft",
              agent: "writer",
              tool: "gmail__send",
              args: { to: "ada@acme.example" },
              callId: "call-1",
              resume: { messages: [], calls: [], step: 0 },
            },
          ],
          [
            today("10:41:00"),
            { type: "run.waiting", state: "draft", events: ["approve", "reject"] },
          ],
        ],
      });

      const { io } = await showIn(acme, "09d9a0");

      expect(io.stdout.slice(-3)).toEqual([
        "",
        "! Waiting for your approval: Writer wants to use gmail__send",
        "  Answer with: halonic runs send 09d9a0 approve (or reject)",
      ]);
    });

    it("says one answer settles only the first of several tool approvals (HAL-7937)", async () => {
      const ask = (time: string, callId: string, tool: string): readonly [string, RunEventBody] => [
          today(time),
          {
            type: "approval.requested",
            state: "draft",
            agent: "writer",
            tool,
            args: {},
            callId,
            resume: { messages: [], calls: [], step: 0 },
          },
        ];
      await storeRuns({
        ...waiting,
        after: [
          [today("10:40:30"), { type: "state.entered", state: "draft" }],
          ask("10:41:00", "call-1", "gmail__send"),
          ask("10:41:01", "call-2", "gmail__delete"),
          [
            today("10:41:01"),
            { type: "run.waiting", state: "draft", events: ["approve", "reject"] },
          ],
        ],
      });

      const { io } = await showIn(acme, "09d9a0");

      expect(io.stdout.slice(-5)).toEqual([
        "",
        "! Waiting for your approval: Writer wants to use gmail__send",
        "! Waiting for your approval: Writer wants to use gmail__delete",
        "  Answer with: halonic runs send 09d9a0 approve (or reject)",
        "  Each answer settles the first one listed.",
      ]);
    });

    it("ends with the wait step's title as the engine filled it in (HAL-7012)", async () => {
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
              title: "Approve the reply to Ada",
              body: "Hi Ada, thanks for writing.",
            },
          ],
        ],
      });

      const { io } = await showIn(acme, "09d9a0");

      expect(io.stdout.slice(-2)).toEqual([
        "! Waiting for you: Approve the reply to Ada",
        "  Answer with: halonic runs send 09d9a0 approve (or reject)",
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
        "  Answer with: halonic runs send 09d9a0 approve (Send reply) (or reject (Discard))",
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
        "  Answer with: halonic runs send 09d9a0 approve (Send it) (or needs_changes)",
      );
    });

    it("ends a running run with the step it is in", async () => {
      await storeRuns(triaged("run_mfx3k2a1_0a0b0d", []));

      const { io } = await showIn(acme, "0a0b0d");

      expect(io.stdout).toEqual([
        "Mail triage in Acme · run 0a0b0d · started 10:20, still running",
        "",
        "◌ Read the email   Writer · default · running since 10:20",
      ]);
    });
  });
});
