// `DurableScheduler` against the real run objects inside workerd: which object each key's timers
// go to (see `durable-scheduler.test.ts`).

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DurableScheduler, type RunObjectNamespace } from "../durable-scheduler.ts";
import { SuiteCase } from "./suite-case.ts";
import type { TestRunObject } from "./test-run-object.ts";

export { TestRunObject } from "./test-run-object.ts";

/** What the runner binds for this suite. */
interface TestEnv {
  RUNS: DurableObjectNamespace<TestRunObject>;
}

/** The case's run objects, with a note of every name asked for and every stub taken. */
function countingNamespace() {
  const { RUNS } = env as TestEnv;
  const objects = new SuiteCase().namespace(RUNS);
  const counted = {
    names: [] as string[],
    gets: 0,
    idFromName(name: string): DurableObjectId {
      counted.names.push(name);
      return objects.idFromName(name);
    },
    get(id: DurableObjectId) {
      counted.gets += 1;
      return objects.get(id);
    },
  } satisfies RunObjectNamespace<DurableObjectId> & { names: string[]; gets: number };
  return counted;
}

describe("DurableScheduler", () => {
  it("keeps each key's timers in the object named after the key, behind the prefix", async () => {
    const namespace = countingNamespace();
    const scheduler = new DurableScheduler({ namespace, namePrefix: "acme:" });
    const at = new Date(Date.UTC(2026, 0, 2)).toISOString();
    await scheduler.schedule("run_1", "wait", at);
    expect(await scheduler.pending("run_1")).toEqual([{ key: "run_1", timerId: "wait", at }]);
    expect(await scheduler.pending("run_2")).toEqual([]);
    await scheduler.cancel("run_1", "wait");
    expect(await scheduler.pending("run_1")).toEqual([]);
    expect(new Set(namespace.names)).toEqual(new Set(["acme:run_1", "acme:run_2"]));
  });

  it("names the object after the key alone without a prefix, with a fresh stub per call", async () => {
    const namespace = countingNamespace();
    const scheduler = new DurableScheduler({ namespace });
    await scheduler.pending("run_1");
    await scheduler.pending("run_1");
    expect(namespace.names).toEqual(["run_1", "run_1"]);
    expect(namespace.gets).toBe(2);
  });
});
