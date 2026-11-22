import { answerNotAnOptionCause, type RunEventBody } from "@halonicjs/events";
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
  storeRuns,
  today,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { runsCommandWith } from "./command.ts";

// `runs show` on a run whose step failed because the child run it started
// failed: the child's cause, led by the parent's step (HAL-15555).

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-show-child-failed");
  await writeFiles(acmeRuns.acme, {
    "models.yaml": "aliases:\n  local:\n    provider: ollama\n    model: llama3.2\n",
    "providers/ollama.yaml": "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n",
    "hubs/support/workflows/topics.workflow.yaml": topics,
    "hubs/support/workflows/draft-one.workflow.yaml": draftOne,
    "hubs/support/agents/writer.agent.yaml":
      "id: writer\nname: Writer\nmodel: local\ninstructions: Write it.\n",
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** Topics: a draft for each topic, one child run of Draft one per item. */
const topics = [
  "id: topics",
  "name: Topics",
  "initial: each",
  "states:",
  "  each:",
  "    description: Each",
  "    type: foreach",
  '    items: "{{input.topics}}"',
  "    workflow: draft-one",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

/** Draft one: Writer drafts one topic. */
const draftOne = [
  "id: draft-one",
  "name: Draft one",
  "initial: draft",
  "states:",
  "  draft:",
  "    description: Draft",
  "    agent: writer",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

const parentId = "run_mfx3k2a1_7a7a01";
const childId = "run_mfx3k2a1_c1c1c1";

/** Topics, failed in Each after the run for item `item` (0-based) failed. */
function topicsFailed(item: number | undefined): StoredRun {
  const finished = {
    type: "workflow.finished",
    state: "each",
    workflow: "draft-one",
    childRunId: childId,
    status: "failed",
    error: "Ollama isn't answering",
    ...(item === undefined ? {} : { item }),
  } as const;
  return {
    id: parentId,
    workflowId: "topics",
    start: today("10:20:00"),
    after: [
      [today("10:20:00"), { type: "state.entered", state: "each" }],
      [today("10:20:03"), finished],
      [
        today("10:20:03"),
        { type: "run.failed", state: "each", error: `Workflow "draft-one" failed: boom` },
      ],
    ],
  };
}

/** Draft one's run, failed in Draft with `failed`'s reason. */
function draftFailed(
  failed: Pick<Extract<RunEventBody, { type: "run.failed" }>, "error" | "reason" | "cause">,
): StoredRun {
  return {
    id: childId,
    workflowId: "draft-one",
    start: today("10:20:01"),
    parent: { runId: parentId, state: "each", depth: 1 },
    after: [
      [today("10:20:01"), { type: "state.entered", state: "draft" }],
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
        { type: "run.failed", state: "draft", host: "localhost:11434", ...failed },
      ],
    ],
  };
}

async function show(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const command = runsCommandWith(acmeRunsSetup(acmeRuns));
  const code = await runCli(["runs", "show", ...args], io, [command]);
  return { code, io };
}

verifies("cli.commands.runs.show-child-failure", () => {
  describe("a run whose child run failed", () => {
    it("says the child's cause on the run's line, its fix, and the way to the child", async () => {
      await storeRuns(
        acmeRuns,
        topicsFailed(1),
        draftFailed({ error: "connect ECONNREFUSED", reason: "model-unreachable" }),
      );

      const { code, io } = await show("7a7a01");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.slice(-4)).toEqual([
        "✕ Topics failed in the step Each: the run it started for item 2 failed in the step Draft: Halonic couldn't reach Ollama at localhost:11434 for the model alias local.",
        "  Start Ollama, then run again.",
        "  See that run: halonic runs show c1c1c1",
        "  Sent nothing",
      ]);
    });

    it("names a workflow step's child without an item, and keeps a cause it can't name", async () => {
      await storeRuns(
        acmeRuns,
        topicsFailed(undefined),
        draftFailed({ error: "the bank is offline" }),
      );

      const { io } = await show("7a7a01");

      expect(io.stdout.at(-4)).toBe(
        "✕ Topics failed in the step Each: the run it started failed in the step Draft. Halonic can't tell the cause yet: the bank is offline.",
      );
      expect(io.stdout.at(-2)).toBe("  See that run: halonic runs show c1c1c1");
    });

    it("leaves out the way to the child when its fix already names it", async () => {
      const turnLimit = {
        kind: "limit_reached",
        code: "engine.turn-limit",
        detail: { agent: "writer", turns: "3" },
      } as const;
      await storeRuns(
        acmeRuns,
        topicsFailed(1),
        draftFailed({ error: "out of model calls", reason: "error", cause: turnLimit }),
      );

      const { io } = await show("7a7a01");

      expect(io.stdout.slice(-2)).toEqual([
        "  See what writer did with halonic runs show c1c1c1. Raise its model call limit (maxSteps) in writer.agent.yaml if it needs more.",
        "  Sent nothing",
      ]);
    });

    it("keeps the run's own lines when the child's log is gone", async () => {
      await storeRuns(acmeRuns, topicsFailed(1));

      const { io } = await show("7a7a01");

      expect(io.stdout.at(-3)).toMatch(
        /^✕ Topics failed in the step Each\. Halonic can't tell the cause yet: Workflow/,
      );
    });
  });
});

verifies("cli.commands.runs.show", () => {
  describe("a child run that failed (HAL-15864)", () => {
    /** Writer answered "maybe" where the step takes yes or no, as the engine words it. */
    const offOptions = (cause: "with-cause" | "older-log") => ({
      error:
        "The agent writer answered \"maybe\", which isn't one of its options (yes, no). Tighten the agent's instructions or use a larger model.",
      reason: "answer-not-an-option" as const,
      ...(cause === "with-cause" && {
        cause: answerNotAnOptionCause({ agent: "writer", options: ["yes", "no"] }),
      }),
    });

    it("ends with the way to the run that started it, keeping --dir", async () => {
      await storeRuns(acmeRuns, topicsFailed(1), draftFailed(offOptions("with-cause")));

      const { io } = await show("c1c1c1");

      expect(io.stdout.slice(-3)).toEqual([
        "✕ Draft one failed in the step Draft. The agent Writer answered \"maybe\", which isn't one of its options (yes, no). Tighten the agent's instructions or use a larger model.",
        "  See the run that started it: halonic runs show 7a7a01",
        "  Sent nothing",
      ]);
      expect((await show("--dir", ".", "c1c1c1")).io.stdout.at(-2)).toBe(
        "  See the run that started it: halonic runs show --dir . 7a7a01",
      );
    });

    it("names the agent as its file does on the run that started it too", async () => {
      await storeRuns(acmeRuns, topicsFailed(1), draftFailed(offOptions("with-cause")));

      const { io } = await show("7a7a01");

      expect(io.stdout.at(-3)).toBe(
        "✕ Topics failed in the step Each: the run it started for item 2 failed in the step Draft. The agent Writer answered \"maybe\", which isn't one of its options (yes, no). Tighten the agent's instructions or use a larger model.",
      );
    });

    it("keeps the agent's id in a log without the cause", async () => {
      await storeRuns(acmeRuns, topicsFailed(1), draftFailed(offOptions("older-log")));

      const { io } = await show("c1c1c1");

      expect(io.stdout.at(-3)).toMatch(
        /^✕ Draft one failed in the step Draft\. The agent writer answered /,
      );
    });
  });
});
