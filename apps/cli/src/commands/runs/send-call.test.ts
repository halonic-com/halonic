import type { RunEvent, RunEventBody } from "@halonicjs/events";
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
  waiting,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { runsCommandWith } from "./command.ts";

// `halonic runs send --call`: a send that names the approval it answers
// (HAL-16382), so the same command typed twice can't answer the next one.

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-send-call");
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

async function halonic(args: readonly string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(args, io, [runsCommandWith(acmeRunsSetup(acmeRuns))]);
  return { code, io };
}

/** The run's events as they are in its log, to see that nothing was sent. */
async function eventsOf(runId: string): Promise<readonly RunEvent[]> {
  return (await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile)).events(runId);
}

/** The writer's call `callId` to `tool`, waiting for the person's OK. */
function asked(callId: string, tool: string): RunEventBody {
  return {
    type: "approval.requested",
    state: "draft",
    agent: "writer",
    tool,
    args: {},
    callId,
    resume: { messages: [], calls: [], step: 0 },
  };
}

/** A person's OK to the writer's call `callId` to `tool`. */
function answered(callId: string, tool: string): RunEventBody {
  return {
    type: "approval.resolved",
    state: "draft",
    agent: "writer",
    tool,
    callId,
    approved: true,
  };
}

/** The log of a run waiting on two approvals: `call-1` to send the email, then `call-2` to delete one. */
const askedTwo: readonly (readonly [string, RunEventBody])[] = [
  [today("10:40:30"), { type: "state.entered", state: "draft" }],
  [today("10:41:00"), asked("call-1", "gmail__send")],
  [today("10:41:01"), asked("call-2", "gmail__delete")],
  [today("10:41:01"), { type: "run.waiting", state: "draft", events: ["approve", "reject"] }],
];

/** A run waiting on both of {@link askedTwo}'s approvals. */
const waitingOnTwo: StoredRun = { ...waiting, after: askedTwo };

verifies("cli.commands.runs.send-call", () => {
  describe("the waiting lines", () => {
    it("show each approval's call, and answer the oldest by its call", async () => {
      await storeRuns(acmeRuns, waitingOnTwo);

      const { io } = await halonic(["runs", "show", "09d9a0"]);

      expect(io.stdout.slice(-4)).toEqual([
        "! Waiting for your approval: writer wants to use gmail__send (call call-1)",
        "! Waiting for your approval: writer wants to use gmail__delete (call call-2)",
        "  Answer with: halonic runs send 09d9a0 approve --call call-1 (or reject)",
        "  To answer another one, put the call from its line after --call.",
      ]);
    });
  });

  describe("a call that no longer waits", () => {
    it("says someone answered it first, and sends nothing", async () => {
      await storeRuns(acmeRuns, {
        ...waitingOnTwo,
        after: [...askedTwo, [today("10:42:00"), answered("call-2", "gmail__delete")]],
      });
      const before = await eventsOf(waiting.id);

      const { code, io } = await halonic(["runs", "send", "09d9a0", "approve", "--call", "call-2"]);

      expect(code).toBe(exitCode.conflict);
      expect(io.stderr).toEqual([
        "✕ Couldn't send approve to run 09d9a0: someone answered that approval first.",
        "  See it with halonic runs show 09d9a0.",
      ]);
      expect(await eventsOf(waiting.id)).toEqual(before);
    });
  });

  describe("a call the run never asked about", () => {
    it("says so, and sends nothing", async () => {
      await storeRuns(acmeRuns, waitingOnTwo);
      const before = await eventsOf(waiting.id);

      const { code, io } = await halonic(["runs", "send", "09d9a0", "approve", "--call", "call-9"]);

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr).toEqual([
        "✕ Couldn't send approve to run 09d9a0: it never asked for your approval of call call-9.",
        "  See it with halonic runs show 09d9a0.",
      ]);
      expect(await eventsOf(waiting.id)).toEqual(before);
    });
  });

  describe("a call that waits", () => {
    it("sends the event for it, though an older one waits", async () => {
      await storeRuns(acmeRuns, waitingOnTwo);

      const { io } = await halonic(["runs", "send", "09d9a0", "approve", "--call", "call-2"]);

      // The run then goes on in the engine, which the test's stored run has no definitions for.
      expect(io.stderr).toEqual([]);
      expect(io.stdout[0]).toBe("✓ Sent approve to run 09d9a0. Support reply goes on.");
    });
  });
});
