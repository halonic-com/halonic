/**
 * The `RunStore` contract against `DurableRunStore`, the real `RunObject` (its log, its outbox and
 * its alarm) and a real D1 run list, inside workerd. A case's runs sit in objects named after it
 * and in a run list scope of its own, so each `make()` starts empty. The list may lag the log, so
 * the contract's `settleList` fires the alarms of the objects the store touched, which send the
 * run list updates (see `test-run-object.ts`).
 */

import { env } from "cloudflare:workers";
import { D1RunList } from "@halonicjs/adapter-cloudflare-storage";
import type { RunStore } from "@halonicjs/ports";
import { runStoreContract } from "@halonicjs/testing-contracts";
import { DurableRunStore } from "../durable-run-store.ts";
import { type Case, cases, SuiteClock, type TestRunObject } from "./test-run-object.ts";

export { TestRunObject } from "./test-run-object.ts";

/** What the runner binds for this suite (see `run-store.test.ts`). */
interface TestEnv {
  RUNS: DurableObjectNamespace<TestRunObject>;
  /** The test Worker's D1 database. */
  DB: D1Database;
}

/** The case each store was made for. */
const caseOfStore = new WeakMap<RunStore, Case>();

runStoreContract(
  "durable object and D1",
  async () => {
    const caseId = crypto.randomUUID();
    const { RUNS, DB } = env as TestEnv;
    const runList = new D1RunList(DB, { scope: caseId });
    const objectNames = new Set<string>();
    const noListener = { onTimer: async () => {}, onTick: async () => {} };
    const suiteCase = { clock: new SuiteClock(), listener: noListener, runList, objectNames };
    cases.set(caseId, suiteCase);
    const store = new DurableRunStore({ namespace: RUNS, runList, namePrefix: caseId });
    caseOfStore.set(store, suiteCase);
    return store;
  },
  {
    async settleList(store) {
      const { RUNS } = env as TestEnv;
      const suiteCase = caseOfStore.get(store);
      if (suiteCase === undefined) throw new Error("This store was not made through make().");
      await Promise.all(
        [...suiteCase.objectNames].map((name) => RUNS.get(RUNS.idFromName(name)).fireAlarm()),
      );
    },
  },
);
