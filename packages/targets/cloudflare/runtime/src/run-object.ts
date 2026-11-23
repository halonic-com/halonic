import {
  RunObject as AdapterRunObject,
  type RunListSink,
} from "@halonicjs/adapter-cloudflare-durable";
import { D1RunList } from "@halonicjs/adapter-cloudflare-storage";
import type { AssembledEngine, LocalExecutor } from "@halonicjs/engine";
import type { SchedulerListener } from "@halonicjs/ports";
import type { RuntimeEnv } from "./env.ts";
import {
  createRuntime,
  type Runtime,
  type RuntimeOptions,
  runtimeOptionsOfNamePrefix,
} from "./runtime.ts";
import { workerEngine } from "./worker-runs.ts";

/**
 * The Worker's run object. The adapter's `RunObject` has no run list of its own: its alarm sends
 * each run's summary to the one `runList()` gives, and without this override every send failed,
 * so the run list, and the admin export that reads it, never held a run (HAL-13864).
 *
 * Its alarm hands each due timer to the Worker's engine (`workerEngine`), the one the API starts
 * runs with, so a run moves on one step per timer (HAL-13210, part c).
 *
 * Both work in the run's own scope: the object reads the name prefix it was first written under
 * (`namePrefix()`) and builds its run list and engine from that, never unscoped, so an alarm
 * can't publish a scope's run to another scope's list or write its timers' events elsewhere.
 * Each is built on first use and kept while the object lives.
 *
 * The Worker exports it as `RunObject`, the class name Cloudflare keys the objects' data by.
 */
export class RunObject extends AdapterRunObject {
  #executor: Promise<LocalExecutor> | undefined;
  #scopedRunList: Promise<D1RunList> | undefined;

  protected override runList(): RunListSink {
    return {
      publish: async (summary, seq) => {
        const runList = await this.#runListOfScope();
        await runList.publish(summary, seq);
      },
    };
  }

  protected override timerListener(): Pick<SchedulerListener, "onTimer"> {
    return {
      onTimer: async (timer) => {
        const executor = await this.#engineExecutor();
        await executor.onTimer(timer);
      },
    };
  }

  /** The engine the timers go to: the Worker's. Only a test gives it another model. */
  protected engineOf(runtime: Runtime): AssembledEngine {
    return workerEngine(runtime);
  }

  /** The engine's executor, built on first use. A failed build isn't kept, so the timer's retry builds again. */
  #engineExecutor(): Promise<LocalExecutor> {
    this.#executor ??= this.#runtimeOptions()
      .then((options) => createRuntime(this.env as unknown as RuntimeEnv, options))
      .then((runtime) => this.engineOf(runtime).executor)
      .catch((error: unknown) => {
        this.#executor = undefined;
        throw error;
      });
    return this.#executor;
  }

  /** The D1 run list of the object's scope, built on first use. A failed read isn't kept. */
  #runListOfScope(): Promise<D1RunList> {
    const { DB } = this.env as unknown as Pick<RuntimeEnv, "DB">;
    this.#scopedRunList ??= this.#runtimeOptions()
      .then(({ scope }) => new D1RunList(DB, { scope: scope ?? "" }))
      .catch((error: unknown) => {
        this.#scopedRunList = undefined;
        throw error;
      });
    return this.#scopedRunList;
  }

  /** The runtime of the scope the object was first written under, with the deployment's definitions. */
  async #runtimeOptions(): Promise<RuntimeOptions> {
    return runtimeOptionsOfNamePrefix(await this.namePrefix());
  }
}
