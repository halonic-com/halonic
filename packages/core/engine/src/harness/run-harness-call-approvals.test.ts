import type { RunEventBody } from "@halonicjs/events";
import { StopSource } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { finished, harnessPorts, startLimits, stillOpen } from "./harness-test-kit.test-helper.ts";
import {
  type HarnessApprovals,
  type HarnessCall,
  type HarnessEventLog,
  type HarnessQuestion,
  runHarnessCall,
} from "./run-harness-call.ts";

const call: HarnessCall = {
  effect: {
    callId: "call-1",
    state: "draft",
    agent: "writer",
    harness: "claude-code",
    prompt: "Reply to support",
  },
  runId: "run_1",
  hubId: "acme",
  agent: writerAgent("claude-code"),
  filesFolder: null,
};

/** A signal no one tells to stop, for calls the engine doesn't stop. */
const goingOn = new StopSource().signal;

/** Runs the call on the ports with `approvals`, and keeps what it wrote to the log. */
async function runWith(
  ports: ReturnType<typeof harnessPorts>,
  approvals: HarnessApprovals,
  stop = goingOn,
) {
  const written: RunEventBody[] = [];
  const log: HarnessEventLog = {
    append: async (event) => {
      written.push(event);
    },
    settled: async () => {},
    whileHeld: (work) => work(),
  };
  try {
    const output = await runHarnessCall(
      ports.options,
      call,
      log,
      approvals,
      startLimits().limits,
      stop,
    );
    return { output, written };
  } catch (error) {
    return { error, written };
  }
}

verifies("engine.harness-approvals", () => {
  const asked: HarnessQuestion = {
    tool: "Bash",
    args: { command: "rm -r drafts" },
  };

  /** Approvals that note each question and answer it with `answer`. */
  function answering(answer: { approved: boolean; comment?: string }) {
    const questions: HarnessQuestion[] = [];
    const approvals: HarnessApprovals = {
      ask: async (question) => {
        questions.push(question);
        return answer;
      },
    };
    return { approvals, questions };
  }

  it("asks the person, and passes the answer on under the harness's own call id", async () => {
    const ports = harnessPorts();
    ports.harness.events = [
      { type: "approval.requested", agent: "writer", callId: "toolu_7", ...asked },
      finished("Cleaned up"),
    ];
    const { approvals, questions } = answering({ approved: true, comment: "Fine" });

    const { output, written } = await runWith(ports, approvals);

    expect(output).toBe("Cleaned up");
    expect(questions).toEqual([asked]);
    expect(ports.harness.sent).toEqual([
      { type: "approval", callId: "toolu_7", approved: true, comment: "Fine" },
    ]);
    // The run records the question under its own call id, not the harness's.
    expect(written.map((event) => event.type)).not.toContain("approval.requested");
  });

  it("asks while the log is held, so nothing is written between the question and the answer", async () => {
    const ports = harnessPorts();
    ports.harness.events = [
      { type: "approval.requested", agent: "writer", callId: "toolu_7", ...asked },
      finished("Cleaned up"),
    ];
    const order: string[] = [];
    const log: HarnessEventLog = {
      append: async () => {},
      settled: async () => {},
      whileHeld: async (work) => {
        order.push("log held");
        try {
          return await work();
        } finally {
          order.push("log let go");
        }
      },
    };
    const approvals: HarnessApprovals = {
      ask: async () => {
        order.push("ask");
        return { approved: false };
      },
    };

    await runHarnessCall(ports.options, call, log, approvals, startLimits().limits, goingOn);

    expect(order).toEqual(["log held", "ask", "log let go"]);
    expect(ports.harness.sent).toEqual([{ type: "approval", callId: "toolu_7", approved: false }]);
  });

  it("stops everything when the engine stops it while it waits for the answer", async () => {
    const ports = harnessPorts();
    ports.harness.events = [
      { type: "approval.requested", agent: "writer", callId: "toolu_7", ...asked },
      finished("Cleaned up"),
    ];
    const stop = new StopSource();
    const asking = Promise.withResolvers<void>();
    const approvals: HarnessApprovals = {
      ask: () => {
        asking.resolve();
        return new Promise(() => {});
      },
    };

    const result = runWith(ports, approvals, stop.signal);
    await asking.promise;
    stop.stop(new Error("The engine stopped."));
    const { error } = await result;

    expect(String(error)).toContain("The engine stopped.");
    expect(ports.harness.sent).toEqual([]);
    expect(stillOpen(ports.steps)).toBe(0);
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
  });
});
