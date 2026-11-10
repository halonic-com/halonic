import type { RunEvent } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import type { ChatResponse, ScheduledTimer, Scheduler } from "@halonicjs/ports";
import { fixedIds } from "@halonicjs/std";
import { secretsWith, steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import { KernelBlobs, KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import { LocalExecutor } from "../local-executor.ts";
import { ScriptedModel } from "../testing/scripted-model.ts";

/**
 * Timers in a map that a test delivers with {@link TestScheduler.runDue},
 * ignoring their times: the run tests are about the order of steps, not
 * the clock.
 */
export class TestScheduler implements Scheduler {
  readonly timers = new Map<string, ScheduledTimer>();
  onTimer: (timer: ScheduledTimer) => Promise<void> = async () => {};

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    this.timers.set(JSON.stringify([key, timerId]), { key, timerId, at });
  }

  async cancel(key: string, timerId: string): Promise<void> {
    this.timers.delete(JSON.stringify([key, timerId]));
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return [...this.timers.values()].filter((timer) => timer.key === key);
  }

  /**
   * Delivers every timer set until none is left, each `times` times at once,
   * as a platform that delivers twice would.
   */
  async runDue(times = 1): Promise<void> {
    while (this.timers.size > 0) {
      const due = [...this.timers.values()];
      this.timers.clear();
      for (const timer of due) {
        await Promise.all(Array.from({ length: times }, () => this.onTimer({ ...timer })));
      }
    }
  }
}

/**
 * A run store whose next read of a log can be held: it reads the log at
 * once, but gives it back only when the test releases it, as a slow disk
 * would after another write has landed.
 */
export class HeldRuns extends KernelRuns {
  #held: Promise<void> | undefined;

  /** Holds the next `events` read; call the returned function to release it. */
  holdNextRead(): () => void {
    let release = () => {};
    this.#held = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  override async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    const events = await super.events(runId, afterSeq);
    const held = this.#held;
    this.#held = undefined;
    if (held !== undefined) await held;
    return events;
  }
}

/**
 * A local executor with runs on memory ports, a scripted model and the reply
 * workflow, with `agents` as the hub's agents when given.
 */
export function runsOn<Runs extends KernelRuns = KernelRuns>(
  answers: (ChatResponse | Error)[],
  runs: Runs = new KernelRuns() as Runs,
  agents?: Readonly<Record<string, Agent>>,
) {
  const model = new ScriptedModel(answers);
  const scheduler = new TestScheduler();
  const definitionsAsked: string[] = [];
  const executor = new LocalExecutor({
    resolveModel: async () => ({ provider: model, model: "scripted-1" }),
    halonicTools: [],
    connectors: [],
    secrets: secretsWith(),
    clock: steppingClock(),
    runs: {
      store: runs,
      blobs: new KernelBlobs(),
      scheduler,
      ids: fixedIds(),
      definitionsOf: async (hubId, workflowId) => {
        definitionsAsked.push(`${hubId}/${workflowId}`);
        if (workflowId !== replyWorkflow.id) throw new Error(`No workflow "${workflowId}".`);
        return agents === undefined
          ? { workflow: replyWorkflow }
          : { workflow: replyWorkflow, agents };
      },
    },
  });
  scheduler.onTimer = (timer) => executor.onTimer(timer);
  return { executor, model, runs, scheduler, definitionsAsked };
}

/** A start of the reply workflow in the `acme` hub. */
export const replyStart = { hubId: "acme", workflowId: "reply", input: { from: "support" } };

/** The types of a run's events, in order. */
export function typesOf(events: readonly RunEvent[] | undefined): string[] {
  return (events ?? []).map((event) => event.type);
}
