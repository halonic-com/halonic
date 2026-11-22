// The engine of the Worker (HAL-13210, part a2): the kernel's `LocalExecutor`, put together by
// `assembleEngine` as `halonic serve` and the desktop Studio do, on the Worker's own ports. No run
// logic lives here, so a run on Cloudflare takes the same steps as one on a laptop.
//
// The Worker has no harness host, no proposal folders and no stdio connectors, so it leaves
// `harnesses`, `proposalFolders` and `connectorCalls` out. The executor then refuses those effects
// itself: a run whose agent names a harness fails with `harness-unavailable` and an error naming
// the `run-harness` effect, and a `call-tool` effect fails the run, before anything starts.

import {
  type AssembledEngine,
  assembleEngine,
  type LocalExecutorOptions,
  noListedToolApproval,
} from "@halonicjs/engine";
import type {
  BlobStore,
  Clock,
  Coordination,
  IdGenerator,
  RunStore,
  Scheduler,
  Secrets,
} from "@halonicjs/ports";
import { randomIds } from "@halonicjs/std";

/**
 * The Worker's ports the executor runs on. A {@link Runtime} has them all; a Node test passes
 * stand-ins.
 */
export interface WorkerExecutorPorts {
  readonly clock: Clock;
  /** The Workers secrets, from `workerSecrets(env)`: where a turn checks a model's key is set. */
  readonly secrets: Secrets;
  /** The run objects' logs. */
  readonly runStore: RunStore;
  readonly blobs: BlobStore;
  /** The run objects' timers; their alarms deliver them to the executor's `onTimer`. */
  readonly scheduler: Scheduler;
  readonly coordination: Coordination;
}

/** What runs are given: the executor's `runs` options. */
type RunsOptions = NonNullable<LocalExecutorOptions["runs"]>;

/** What the Worker's executor gets beyond its ports, so this file depends on no workspace format. */
export interface WorkerExecutorInput {
  /** The definitions a new run starts with, from the deployment's run-definitions index. */
  readonly definitionsOf: RunsOptions["definitionsOf"];
  /** Picks the model of each call. */
  readonly resolveModel: LocalExecutorOptions["resolveModel"];
  /** Gives a run its id when the start request names none; random ids by default. */
  readonly ids?: IdGenerator;
}

/** Random bytes from the Web Crypto API, which workerd has. */
function webRandomBytes(byteCount: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(byteCount));
}

/**
 * The scheduler the engine gets: the run objects' own. The engine's listener isn't used, because
 * each run object's alarm hands its due timer to the executor; and closing the engine leaves the
 * timers with their run objects, so the next request's engine moves the runs on.
 */
function runObjectScheduler(scheduler: Scheduler): Scheduler & { close(): Promise<void> } {
  return {
    schedule: (key, timerId, at) => scheduler.schedule(key, timerId, at),
    cancel: (key, timerId) => scheduler.cancel(key, timerId),
    pending: (key) => scheduler.pending(key),
    close: async () => {},
  };
}

/**
 * Builds the Worker's engine: the kernel's `LocalExecutor` on the Worker's run store, run-object
 * scheduler, blobs and secrets, with no Halonic tools, no connectors and every listed tool off.
 * Harness, proposal-folder and connector effects are refused, as the file's head says.
 *
 * @param ports - the Worker's ports, such as a {@link Runtime}
 * @param input - the run definitions and the model resolver
 *
 * @example
 * const engine = workerExecutor(await createRuntime(env), { definitionsOf, resolveModel });
 * await engine.executor.start({ hubId: "acme", workflowId: "reply", input: {} });
 */
export function workerExecutor(
  ports: WorkerExecutorPorts,
  input: WorkerExecutorInput,
): AssembledEngine {
  const { clock, secrets } = ports;
  return assembleEngine({
    createScheduler: () => runObjectScheduler(ports.scheduler),
    executor: {
      resolveModel: input.resolveModel,
      halonicTools: [],
      connectors: [],
      // The Worker keeps no tool approvals yet, so every listed tool stays off.
      listedToolApproval: noListedToolApproval,
      secrets,
      clock,
      runs: {
        store: ports.runStore,
        blobs: ports.blobs,
        ids: input.ids ?? randomIds(webRandomBytes, clock),
        definitionsOf: input.definitionsOf,
      },
    },
    coordination: ports.coordination,
    // A Worker holds no lock: each run object serialises its own run.
    release: async () => {},
  });
}
