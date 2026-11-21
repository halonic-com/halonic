/**
 * The suite's side of a workerd spec: a clock it moves, a listener and run list the test objects
 * answer to, and the list of objects the case has touched. The suite and each object run in
 * isolates of their own on Cloudflare, so all three reach an object over RPC (see `object-case.ts`).
 * Test code only: never import it from a runtime bundle.
 */

import { RpcTarget } from "cloudflare:workers";
import type { RunSummary } from "@halonicjs/events";
import type { ScheduledTimer, SchedulerListener } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import type { RunListSink } from "../run-state.ts";
import type { CaseHooks, CaseObject } from "./object-case.ts";
import type { TestRunObject } from "./test-run-object.ts";

/**
 * A clock that only moves when the suite moves it. Objects read it once the suite pushes it. It
 * starts ten years ahead unless told otherwise, so an alarm set by its time never fires by itself.
 */
export class SuiteClock implements Clock {
  #now: number;

  constructor(startMs: number = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) {
    this.#now = startMs;
  }

  now(): Date {
    return new Date(this.#now);
  }

  advance(ms: number): void {
    this.#now += ms;
  }
}

/** The suite's listener and run list, as the objects call them over RPC. */
class SuiteHooks extends RpcTarget implements CaseHooks {
  readonly #listener: SchedulerListener;
  readonly #runList: RunListSink;

  constructor(listener: SchedulerListener, runList: RunListSink) {
    super();
    this.#listener = listener;
    this.#runList = runList;
  }

  onTimer(timer: ScheduledTimer): Promise<void> {
    return this.#listener.onTimer(timer);
  }

  onTick(at: string): Promise<void> {
    return this.#listener.onTick(at);
  }

  publish(summary: RunSummary, seq: number): Promise<void> {
    return this.#runList.publish(summary, seq);
  }
}

/** What a case needs from the suite: nothing, when it never delivers a timer or lists a run. */
export interface SuiteCaseOptions {
  listener?: SchedulerListener;
  runList?: RunListSink;
}

const noListener: SchedulerListener = { onTimer: async () => {}, onTick: async () => {} };
const noRunList: RunListSink = { publish: async () => {} };

/** The time each object of a namespace was last given, by the object's name. */
type PushedTimes = Map<string, number>;

/**
 * One store or scheduler under test. The objects it reaches are the ones its {@link namespace}
 * hands out: each is given the case's clock before the first call the code under test makes, and
 * again before the first call after the suite moved the clock.
 */
export class SuiteCase {
  readonly clock = new SuiteClock();
  readonly #hooks: SuiteHooks;
  readonly #touched = new Map<
    DurableObjectNamespace<CaseObject & Rpc.DurableObjectBranded>,
    PushedTimes
  >();

  constructor(options: SuiteCaseOptions = {}) {
    this.#hooks = new SuiteHooks(options.listener ?? noListener, options.runList ?? noRunList);
  }

  /**
   * `namespace`, with the objects it gives out tracked and kept on the case's clock. Hand it to
   * the code under test in place of the binding.
   */
  namespace<O extends CaseObject & Rpc.DurableObjectBranded>(
    namespace: DurableObjectNamespace<O>,
  ): DurableObjectNamespace<O> {
    const touchedNames: PushedTimes = new Map();
    this.#touched.set(namespace, touchedNames);
    const stubOf = (id: DurableObjectId) => this.#trackedStub(namespace, touchedNames, id);
    return new Proxy(namespace, {
      get: (target, property) => {
        if (property === "get") return stubOf;
        if (property === "getByName") return (name: string) => stubOf(target.idFromName(name));
        const member = Reflect.get(target, property);
        return typeof member === "function" ? member.bind(target) : member;
      },
    });
  }

  /** Gives every object of the case the clock now, and the hooks again. */
  async push(): Promise<void> {
    for (const [namespace, pushedTimes] of this.#touched) {
      await Promise.all(
        [...pushedTimes.keys()].map((name) => this.#push(namespace, pushedTimes, name)),
      );
    }
  }

  /** Fires the alarms of the run objects the case has touched that are due by its clock. */
  async fireAlarms(runs: DurableObjectNamespace<TestRunObject>): Promise<void> {
    await this.push();
    const names = [...(this.#touched.get(runs)?.keys() ?? [])];
    await Promise.all(names.map((name) => runs.get(runs.idFromName(name)).fireAlarm()));
  }

  /** A stub that gives the object the case's clock first when it hasn't the time the suite has. */
  #trackedStub<O extends CaseObject & Rpc.DurableObjectBranded>(
    namespace: DurableObjectNamespace<O>,
    pushedTimes: PushedTimes,
    id: DurableObjectId,
  ): DurableObjectStub<O> {
    const name = id.name;
    if (name === undefined) throw new Error("A test object has to be made from a name.");
    pushedTimes.set(name, pushedTimes.get(name) ?? Number.NaN);
    const stub = namespace.get(id);
    return new Proxy(stub, {
      get: (target, property) => {
        // A stub answers every property as a method; `then` must stay absent for `await stub`.
        if (property === "then" || typeof property === "symbol")
          return Reflect.get(target, property);
        return async (...args: unknown[]) => {
          if (pushedTimes.get(name) !== this.clock.now().getTime()) {
            await this.#push(namespace, pushedTimes, name);
          }
          return (target as unknown as Record<string, (...args: unknown[]) => unknown>)[property]?.(
            ...args,
          );
        };
      },
    });
  }

  async #push(
    namespace: DurableObjectNamespace<CaseObject & Rpc.DurableObjectBranded>,
    pushedTimes: PushedTimes,
    name: string,
  ): Promise<void> {
    const nowMs = this.clock.now().getTime();
    await namespace.get(namespace.idFromName(name)).setCase(nowMs, this.#hooks);
    pushedTimes.set(name, nowMs);
  }
}
