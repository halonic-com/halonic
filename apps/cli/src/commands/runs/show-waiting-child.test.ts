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

// `runs show` on a run that waits because the child run it started waits
// for the person: the child's waiting lines, and the child's "Started by"
// (HAL-15951).

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-show-waiting-child");
  await writeFiles(acmeRuns.acme, { "hubs/support/workflows/triage.workflow.yaml": triage });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** Triage: Support reply as its step Reply. */
const triage = [
  "id: triage",
  "name: Triage",
  "initial: reply",
  "states:",
  "  reply:",
  "    description: Reply",
  "    type: workflow",
  "    workflow: support-reply",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

const parentId = "run_mfx3k2a1_7a7a01";
const childId = "run_mfx3k2a1_c1c1c1";

/** Triage, waiting in Reply since 10:41 because its child run waits. */
const triageWaiting: StoredRun = {
  id: parentId,
  workflowId: "triage",
  start: today("10:40:00"),
  after: [
    [today("10:40:00"), { type: "state.entered", state: "reply" }],
    [
      today("10:40:01"),
      { type: "workflow.started", state: "reply", workflow: "support-reply", childRunId: childId },
    ],
    [
      today("10:41:00"),
      { type: "run.waiting", state: "reply", events: ["approve", "reject"], child: childId },
    ],
  ],
};

/** Support reply's run Triage started, waiting at Approve this reply? since 10:41. */
const replyWaiting: StoredRun = {
  id: childId,
  start: today("10:40:01"),
  parent: { runId: parentId, state: "reply", depth: 1 },
  after: [
    [today("10:40:30"), { type: "state.entered", state: "review" }],
    [today("10:41:00"), { type: "run.waiting", state: "review", events: ["approve", "reject"] }],
  ],
};

async function show(typed: string): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const command = runsCommandWith(acmeRunsSetup(acmeRuns));
  const code = await runCli(["runs", "show", typed], io, [command]);
  return { code, io };
}

verifies("cli.commands.runs.show-waiting-child", () => {
  describe("a run waiting on its child run", () => {
    it("ends with the child's waiting line and how to answer the child", async () => {
      await storeRuns(acmeRuns, triageWaiting, replyWaiting);

      const { code, io } = await show("7a7a01");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Triage in Acme · run 7a7a01 · started 10:40, waiting for you since 10:41",
        "",
        "◌ Reply   Waiting for child run c1c1c1",
        "",
        "! Waiting for you: Approve this reply?",
        "  Answer with: halonic runs send c1c1c1 approve (or reject)",
      ]);
    });

    it("keeps only the step line when the child's log is gone", async () => {
      await storeRuns(acmeRuns, triageWaiting);

      const { io } = await show("7a7a01");

      expect(io.stdout.at(-1)).toBe("◌ Reply   Waiting for child run c1c1c1");
    });

    it("says under the child's heading which run started it", async () => {
      await storeRuns(acmeRuns, triageWaiting, replyWaiting);

      const { io } = await show("c1c1c1");

      expect(io.stdout.slice(0, 2)).toEqual([
        "Support reply in Acme · run c1c1c1 · started 10:40, waiting for you since 10:41",
        "  Started by run 7a7a01",
      ]);
    });
  });
});
