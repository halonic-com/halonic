import type { RunEvent } from "@halonicjs/events";
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

/** A local executor with runs on memory ports, a scripted model and the reply workflow. */
export function runsOn(answers: (ChatResponse | Error)[], runs = new KernelRuns()) {
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
        return { workflow: replyWorkflow };
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
