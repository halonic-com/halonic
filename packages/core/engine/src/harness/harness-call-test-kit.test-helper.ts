import type { RunEventBody } from "@halonicjs/events";
import { StopSource } from "@halonicjs/std";
import { writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { type harnessPorts, noApprovals, startLimits } from "./harness-test-kit.test-helper.ts";
import { type HarnessCall, type HarnessEventLog, runHarnessCall } from "./run-harness-call.ts";

/** The writer's harness call in `draft`, that the tests of `runHarnessCall` run. */
export const writerCall: HarnessCall = {
  effect: {
    callId: "call-1",
    state: "draft",
    agent: "writer",
    harness: "claude-code",
    prompt: "Reply to support",
  },
  runId: "run_1",
  hubId: "acme",
  agent: { ...writerAgent("claude-code"), instructions: "Write short mails.", model: "sonnet" },
  filesFolder: null,
};

/** A signal no one tells to stop, for calls the engine doesn't stop. */
export const goingOn = new StopSource().signal;

/** A log that stores nothing, except where `append` says. */
export function logOf(append: (event: RunEventBody) => Promise<void>): HarnessEventLog {
  return { append, settled: async () => {}, whileHeld: (work) => work() };
}

/** Runs the call on the ports, and keeps what it wrote to the log. */
export async function runCallOn(
  ports: ReturnType<typeof harnessPorts>,
  limits = startLimits().limits,
  stop = goingOn,
  approvals = noApprovals,
  call = writerCall,
) {
  const written: RunEventBody[] = [];
  const log = logOf(async (event) => {
    written.push(event);
  });
  try {
    const output = await runHarnessCall(ports.options, call, log, approvals, limits, stop);
    return { output, written };
  } catch (error) {
    return { error, written };
  }
}
