import type { RuntimeEnv } from "./env.ts";

/** What the run container's side asks of a run object about its run's bridge (`RunObject` in this package). */
export interface RunBridgeObject {
  /** Answers a request the run's container sent its bridge. */
  bridge(request: Request): Promise<Response>;
  /** Revokes the run's bridge credential. */
  revokeBridge(): Promise<void>;
}

/** The run object named `name`, as far as its bridge goes. The Worker binds `RUN` to its own `RunObject`, which has both. */
export function runBridgeObject(env: Pick<RuntimeEnv, "RUN">, name: string): RunBridgeObject {
  return env.RUN.get(env.RUN.idFromName(name)) as unknown as RunBridgeObject;
}
