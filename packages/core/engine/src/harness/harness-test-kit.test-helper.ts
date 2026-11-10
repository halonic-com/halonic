import type {
  BridgeRecorder,
  Harness,
  HarnessBridge,
  HarnessEvent,
  HarnessRun,
  HarnessTask,
  OpenHarnessBridge,
  Sandbox,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
  ScheduledTimer,
  Scheduler,
} from "@halonicjs/ports";
import { steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import { StartDeadlines } from "../run/start-deadlines.ts";
import type { HarnessAgent, HarnessRunsOptions, Placement } from "./harness-host.ts";
import type { StartPhase } from "./start-limits.ts";

/** What the fakes did, in order, so a test can see that everything started was stopped. */
export type FakeStep =
  | "bridge.open"
  | "bridge.close"
  | `${Placement}.open`
  | "session.close"
  | "harness.start"
  | "harness.cancel";

/** A sandbox whose check and open a test sets, and that notes each session it opens and closes. */
export class FakeSandbox implements Sandbox {
  check: () => Promise<SandboxCheck> = async () => ({ ok: true, reason: null, missing: [] });
  openError: Error | undefined;
  /** When set, `open` waits for it, as a sandbox that is slow to start would. */
  openHeld: Promise<void> | undefined;
  readonly profiles: SandboxProfile[] = [];
  readonly #placement: Placement;
  readonly #steps: FakeStep[];

  constructor(placement: Placement, steps: FakeStep[]) {
    this.#placement = placement;
    this.#steps = steps;
  }

  capabilities() {
    return { files: "shared" as const, strength: "os" as const };
  }

  async open(profile: SandboxProfile): Promise<SandboxSession> {
    if (this.openError !== undefined) throw this.openError;
    await this.openHeld;
    this.#steps.push(`${this.#placement}.open`);
    this.profiles.push(profile);
    const steps = this.#steps;
    return {
      profile,
      fence: { state: "fenced" },
      start: async () => {
        throw new Error("The fake sandbox starts no program.");
      },
      onBlocked: () => () => {},
      close: async () => {
        steps.push("session.close");
      },
    };
  }
}

/**
 * A harness that reports the events a test gives it, then fails with `error`
 * when set. With `silent`, it reports nothing until it's cancelled, as a
 * program that hangs at start would.
 */
export class FakeHarness implements Harness {
  readonly id = "claude-code";
  readonly name = "Claude Code";
  events: HarnessEvent[] = [];
  error: Error | undefined;
  silent = false;
  readonly tasks: HarnessTask[] = [];
  readonly #steps: FakeStep[];

  constructor(steps: FakeStep[]) {
    this.#steps = steps;
  }

  async detect() {
    return { status: "ready" as const, version: "1.0.0" };
  }

  environment(bridge: HarnessBridge): Record<string, string> {
    return { ANTHROPIC_BASE_URL: bridge.url };
  }

  start(task: HarnessTask): HarnessRun {
    this.tasks.push(task);
    this.#steps.push("harness.start");
    const { events, error, silent } = this;
    const steps = this.#steps;
    const cancelled = Promise.withResolvers<void>();
    return {
      async *[Symbol.asyncIterator]() {
        if (silent) {
          await cancelled.promise;
          throw new Error("The run was cancelled.");
        }
        yield* events;
        if (error !== undefined) throw error;
      },
      send: async () => {},
      cancel: async () => {
        steps.push("harness.cancel");
        cancelled.resolve();
      },
    };
  }
}

/** Fake harness ports for a run, with the `writer` agent placed in a sandbox unless a test moves it. */
export function harnessPorts() {
  const steps: FakeStep[] = [];
  const recorders: BridgeRecorder[] = [];
  const sandbox = new FakeSandbox("sandbox", steps);
  const thisComputer = new FakeSandbox("this-computer", steps);
  const harness = new FakeHarness(steps);
  let placement: Placement = "sandbox";
  const bridge: OpenHarnessBridge = {
    url: "http://127.0.0.1:41817",
    token: "not-a-real-token",
    close: async () => {
      steps.push("bridge.close");
    },
  };
  const options: HarnessRunsOptions = {
    placement: { where: async (_agent: HarnessAgent) => placement },
    sandboxes: { sandbox, "this-computer": thisComputer },
    harnesses: { "claude-code": harness },
    bridges: {
      open: async (_agent, recorder) => {
        steps.push("bridge.open");
        recorders.push(recorder);
        return bridge;
      },
    },
    profiles: {
      profileOf: async ({ agentId }) => ({
        profile: {
          workingFolder: `<workspace>/files/agents/${agentId}`,
          tempFolder: "<data>/tmp/run_1",
          settingsFolder: null,
          readOnlyPaths: [],
          deniedPaths: ["<home>/.ssh"],
          env: { PATH: "/usr/bin" },
          network: { bridge: { host: "127.0.0.1", port: 41817 }, allowedSites: [] },
          timeLimitMs: 600_000,
        },
        deniedGroups: [{ code: "ssh-keys", paths: ["<home>/.ssh"] }],
      }),
    },
    home: "<home>",
  };
  return {
    options,
    steps,
    recorders,
    sandbox,
    thisComputer,
    harness,
    placeOnThisComputer: () => {
      placement = "this-computer";
    },
  };
}

/** The agent's own result, which ends a harness run's stream. */
export function finished(output: unknown): HarnessEvent {
  return { type: "agent.finished", agent: "writer", output };
}

/**
 * Start limits on a scheduler that only notes its timers: a test ends a
 * start with `timeUp`, as the scheduler would when its time comes.
 */
export function startLimits() {
  const scheduler = new NotingScheduler();
  const deadlines = new StartDeadlines(scheduler, steppingClock());
  return {
    limits: deadlines.of("run_1", "call-1"),
    scheduler,
    /** Delivers the start limit's timer for `phase`, once it is set. */
    timeUp: async (phase: StartPhase) => {
      const timer = await scheduler.waitFor("run_1", `start:${phase}:call-1`);
      deadlines.expire(timer);
    },
  };
}

/** A scheduler that keeps its timers and delivers none. */
export class NotingScheduler implements Scheduler {
  /** The timers set, by `JSON.stringify([key, timerId])`. */
  readonly timers = new Map<string, ScheduledTimer>();
  readonly #set = new Map<string, PromiseWithResolvers<ScheduledTimer>>();

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    const timer = { key, timerId, at };
    this.timers.set(timerSlot(key, timerId), timer);
    this.#whenSet(key, timerId).resolve(timer);
  }

  async cancel(key: string, timerId: string): Promise<void> {
    this.timers.delete(timerSlot(key, timerId));
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return [...this.timers.values()].filter((timer) => timer.key === key);
  }

  /** The timer with this key and id, once it has first been set. */
  waitFor(key: string, timerId: string): Promise<ScheduledTimer> {
    return this.#whenSet(key, timerId).promise;
  }

  #whenSet(key: string, timerId: string): PromiseWithResolvers<ScheduledTimer> {
    const slot = timerSlot(key, timerId);
    let set = this.#set.get(slot);
    if (set === undefined) {
      set = Promise.withResolvers<ScheduledTimer>();
      this.#set.set(slot, set);
    }
    return set;
  }
}

function timerSlot(key: string, timerId: string): string {
  return JSON.stringify([key, timerId]);
}
