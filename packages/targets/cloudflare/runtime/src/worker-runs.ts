import type { AssembledEngine, LocalExecutor } from "@halonicjs/engine";
import type {
  DefinitionSource,
  RunEventListener,
  RunExecutor,
  RunSubscription,
} from "@halonicjs/ports";
import { indexedRunDefinitions } from "./indexed-run-definitions.ts";
import { type WorkerExecutorPorts, workerExecutor } from "./worker-executor.ts";

/** Where a run's live events come from: the run objects. */
export interface RunEventSource {
  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription;
}

/** The Worker's ports its engine uses. A {@link Runtime} has them all; a Node test passes stand-ins. */
export interface WorkerEnginePorts extends WorkerExecutorPorts {
  /** The snapshot this Worker version serves, whose run-definitions index a run starts from. */
  readonly definitions: DefinitionSource;
}

/** The Worker's ports its runs use: the engine's, and the run objects' live events. */
export interface WorkerRunsPorts extends WorkerEnginePorts {
  readonly runEvents: RunEventSource;
}

/**
 * The model resolver of the Worker's engine, until the Worker reads the deployed workspace's
 * models (S0, HAL-13210). A model call fails the run's step with this error.
 */
async function noModels(): Promise<never> {
  throw new Error("The Cloudflare Worker can't call a model yet.");
}

/**
 * The Worker's engine: {@link workerExecutor}, with each new run's definitions from the
 * snapshot's run-definitions index and no model yet.
 *
 * @example
 * const engine = workerEngine(await createRuntime(env));
 * await engine.executor.start({ hubId: "acme", workflowId: "reply", input: {} });
 */
export function workerEngine(ports: WorkerEnginePorts): AssembledEngine {
  return workerExecutor(ports, {
    definitionsOf: indexedRunDefinitions(ports.definitions),
    resolveModel: noModels,
  });
}

/**
 * The run executor of the Worker: the executor of {@link workerEngine}. It starts, sends to
 * and cancels runs; a run goes on from the timers its run object keeps, which the run object's
 * alarm hands to the same engine (`RunObject`). An agent run answers 501, as on `halonic serve`,
 * because the executor doesn't start one yet. A chat turn is refused: the Worker has no chat.
 * A run's live events stream from its run object, with the same bytes and resume rules as on
 * `serve`.
 *
 * The engine is built on the first call that needs it, so a request that starts nothing
 * builds none.
 */
export function workerRuns(ports: WorkerRunsPorts): RunExecutor {
  let executor: LocalExecutor | undefined;
  const engine = (): LocalExecutor => {
    executor ??= workerEngine(ports).executor;
    return executor;
  };
  return {
    id: "cloudflare-worker",
    start: (request) => engine().start(request),
    startAgent: () => engine().startAgent(),
    send: (runId, event, payload, options) => engine().send(runId, event, payload, options),
    cancel: (runId) => engine().cancel(runId),
    subscribe: (runId, afterSeq, listener) => ports.runEvents.subscribe(runId, afterSeq, listener),
    async chatTurn() {
      throw new Error("The Cloudflare Worker has no chat turns.");
    },
  };
}
