import {
  RunObject as AdapterRunObject,
  type RunListSink,
} from "@halonicjs/adapter-cloudflare-durable";
import { D1RunList } from "@halonicjs/adapter-cloudflare-storage";
import type { AssembledEngine, LocalExecutor } from "@halonicjs/engine";
import type { SchedulerListener } from "@halonicjs/ports";
import type { RuntimeEnv } from "./env.ts";
import { createRuntime, type Runtime } from "./runtime.ts";
import { workerEngine } from "./worker-runs.ts";

/**
 * The Worker's run object. The adapter's `RunObject` has no run list of its own: its alarm sends
 * each run's summary to the one `runList()` gives, and without this override every send failed,
 * so the run list, and the admin export that reads it, never held a run (HAL-13864). It sends to the same D1 run
 * list `createRuntime` reads, unscoped as that one is.
 *
 * Its alarm hands each due timer to the Worker's engine (`workerEngine`), the one the API starts
 * runs with, so a run moves on one step per timer (HAL-13210, part c). The engine is built from
 * `env` on the first timer, unscoped like the run list, and kept while the object lives.
 *
 * The Worker exports it as `RunObject`, the class name Cloudflare keys the objects' data by.
 */
export class RunObject extends AdapterRunObject {
  #executor: Promise<LocalExecutor> | undefined;

  protected override runList(): RunListSink {
    const { DB } = this.env as unknown as Pick<RuntimeEnv, "DB">;
    return new D1RunList(DB);
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
    this.#executor ??= createRuntime(this.env as unknown as RuntimeEnv)
      .then((runtime) => this.engineOf(runtime).executor)
      .catch((error: unknown) => {
        this.#executor = undefined;
        throw error;
      });
    return this.#executor;
  }
}
