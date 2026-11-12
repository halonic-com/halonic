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
import { runsCommandWith } from "./command.ts";

// `runs show` on a run that failed, couldn't try everything or was
// cancelled. The heading, steps and receipt are in show.test.ts.

let acmeRuns: AcmeRuns;
let acme: string;

const runsCommand = () => runsCommandWith(acmeRunsSetup(acmeRuns));

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-show-failed");
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

verifies("cli.commands.runs.show", () => {
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

    it("with --debug, doesn't ask for it again and prints the run log's details on stderr", async () => {
      await storeRuns(
        triage("run_mfx3k2a1_0f0f03", [
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
              error: "the bank is offline",
              reason: "error",
              providerText: { status: 503, text: "upstream down" },
            },
          ],
        ]),
      );

      const { io } = await showIn(acme, "0f0f03", "--debug");

      expect(io.stdout.at(-2)).toBe(
        "  Report it with the details below: https://github.com/halonic-com/halonic/issues",
      );
      expect(io.stderr).toEqual([
        "The engine said: the bank is offline",
        "The provider said (HTTP 503): upstream down",
        "Model calls in this step:",
        "  writer called llama3.2 at ollama",
      ]);
    });

    it("with --debug, escapes control characters in the provider's text", async () => {
      await storeRuns(
        triage("run_mfx3k2a1_0f0f04", [
          ...enteredRead,
          [
            today("10:20:02"),
            {
              type: "run.failed",
              state: "read",
              error: "the bank is offline",
              reason: "error",
              providerText: { status: 503, text: "\u001b[31mupstream down" },
            },
          ],
        ]),
      );

      const { io } = await showIn(acme, "0f0f04", "--debug");

      expect(io.stderr).toContain("The provider said (HTTP 503): \\u001b[31mupstream down");
      expect(io.stderr.join("\n")).not.toContain("\u001b");
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
