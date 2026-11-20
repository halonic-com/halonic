import {
  RunObject as AdapterRunObject,
  type RunListSink,
} from "@halonicjs/adapter-cloudflare-durable";
import { D1RunList } from "@halonicjs/adapter-cloudflare-storage";
import type { RuntimeEnv } from "./env.ts";

/**
 * The Worker's run object. The adapter's `RunObject` has no run list of its own: its alarm sends
 * each run's summary to the one `runList()` gives, and without this override every send failed,
 * so the run list, and the admin export that reads it, never held a run (HAL-13864). It sends to the same D1 run
 * list `createRuntime` reads, unscoped as that one is.
 *
 * The Worker exports it as `RunObject`, the class name Cloudflare keys the objects' data by.
 */
export class RunObject extends AdapterRunObject {
  protected override runList(): RunListSink {
    const { DB } = this.env as unknown as Pick<RuntimeEnv, "DB">;
    return new D1RunList(DB);
  }
}
