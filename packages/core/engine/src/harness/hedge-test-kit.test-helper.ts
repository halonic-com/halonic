import type { RunEventBody } from "@halonicjs/events";
import type { HarnessEvent, HarnessRun, HarnessTask } from "@halonicjs/ports";
import { earlyHedgeConfig } from "@halonicjs/retry-detectors";
import { StopSource } from "@halonicjs/std";
import type { AttemptFolder, AttemptFolders, HedgeStepDecision } from "./early-hedge-host.ts";
import { logOf, writerCall } from "./harness-call-test-kit.test-helper.ts";
import {
  FakeHarness,
  finished,
  harnessPorts,
  startLimits,
} from "./harness-test-kit.test-helper.ts";
import type { HarnessApprovals, HarnessCall } from "./run-harness-call.ts";
import { runHarnessCall } from "./run-harness-call.ts";
import type { StartLimits } from "./start-limits.ts";

/** The setup the detectors were fitted on, as the host names it for the pilot's writer. */
const pilotSetup = { agent: "opencode", model: "deepseek-v4.1-flash", provider: "deepinfra-fp8" };

/** The writer's call, as the pilot runs it: its file says `asks: in-sandbox`. */
export const pilotCall: HarnessCall = {
  ...writerCall,
  agent: { ...writerCall.agent, asks: "in-sandbox" },
};

/** The pilot's call with `changes` on its agent's file. */
export function writerCallWith(changes: Partial<HarnessCall["agent"]>): HarnessCall {
  return { ...pilotCall, agent: { ...pilotCall.agent, ...changes } };
}

/** Attempt folders that note what the step did with them; `ship` fails with `shipError` when set. */
export class FakeFolders implements AttemptFolders {
  /** The version `versionOf` answers, one per call; the last one stays. */
  versions = ["v1"];
  shipError: Error | undefined;
  readonly opened: string[] = [];
  readonly shipped: string[] = [];
  readonly released: string[] = [];

  async versionOf(): Promise<string> {
    return (this.versions.length > 1 ? this.versions.shift() : this.versions[0]) ?? "v1";
  }

  async open(_agent: unknown, attempt: number, version: string): Promise<AttemptFolder> {
    const path = `<data>/hedge/run_1/${attempt}@${version}`;
    this.opened.push(path);
    return {
      path,
      diff: async () => "diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n",
      ship: async () => {
        if (this.shipError !== undefined) throw this.shipError;
        this.shipped.push(path);
      },
      release: async () => {
        this.released.push(path);
      },
    };
  }
}

/**
 * A harness whose attempts report `events` (and fail with `error` when set),
 * while a run on the fallback model reports `fallbackEvents`, and neither
 * hangs nor runs `whileRunning`.
 */
export class PilotHarness extends FakeHarness {
  fallbackEvents: HarnessEvent[] = [finished("from opus")];

  override start(task: HarnessTask): HarnessRun {
    if (task.model !== "opus") return super.start(task);
    const { events, error, hangs, whileRunning } = this;
    this.events = this.fallbackEvents;
    this.error = undefined;
    this.hangs = false;
    this.whileRunning = undefined;
    try {
      return super.start(task);
    } finally {
      this.events = events;
      this.error = error;
      this.hangs = hangs;
      this.whileRunning = whileRunning;
    }
  }
}

/** A clean attempt: one model turn, one edit, then its result. */
export function cleanAttempt(output: unknown): HarnessEvent[] {
  return [
    { type: "tool.called", agent: "writer", tool: "edit", args: { path: "x" } },
    finished(output),
  ];
}

/** A model call's answer, as the bridge reports it, that cost `cost`. */
export function answerCosting(cost: number): HarnessEvent {
  return {
    type: "llm.response",
    agent: "writer",
    provider: "deepinfra",
    model: "deepseek-v4.1-flash",
    usage: { inputTokens: 10, outputTokens: 5 },
    latencyMs: 100,
    text: "",
    cost,
  } as HarnessEvent;
}

/** Fake harness ports with the pilot's early hedge on, and what the step did. */
export function hedgePorts(flag = true) {
  const ports = harnessPorts();
  const harness = new PilotHarness(ports.steps);
  const folders = new FakeFolders();
  const decisions: HedgeStepDecision[] = [];
  let ms = Date.parse("2026-11-26T09:00:00.000Z");
  const options = {
    ...ports.options,
    harnesses: { "claude-code": harness },
    earlyHedge: {
      config: earlyHedgeConfig({ enabled: flag }),
      folders,
      fallbackModel: "opus",
      setupOf: async () => pilotSetup,
      decided: (decision: HedgeStepDecision) => {
        decisions.push(decision);
      },
      now: () => (ms += 1000),
    },
  };
  return { ...ports, options, harness, folders, decisions };
}

/** Questions that reached a person, and approvals that answer each with yes. */
export function askedPeople() {
  const asked: string[] = [];
  const approvals: HarnessApprovals = {
    ask: async ({ tool }) => {
      asked.push(tool);
      return { approved: true };
    },
  };
  return { asked, approvals };
}

/** Runs the pilot's call on the ports, and keeps what it wrote to the log. */
export async function runPilotOn(
  ports: ReturnType<typeof hedgePorts>,
  {
    call = pilotCall,
    stop = new StopSource().signal,
    approvals = askedPeople().approvals,
    limits = startLimits().limits,
  }: {
    call?: HarnessCall;
    stop?: StopSource["signal"];
    approvals?: HarnessApprovals;
    limits?: StartLimits;
  } = {},
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
