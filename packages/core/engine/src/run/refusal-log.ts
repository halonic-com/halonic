// The run log of a run's model call, until step 4 of the HAL-186 plan gives
// the turn its full log (requirement `engine.run-connector-allow`).

import type { Clock, RunStore } from "@halonicjs/ports";
import type { TurnLog } from "../agent/turn-log.ts";
import { SerialRunLog } from "../harness/serial-run-log.ts";
import { branchOfCall } from "../kernel/run-branches.ts";
import type { PendingCall, RunState } from "../kernel/run-state.ts";

/**
 * The log of a run's model call: it writes the turn's `tool.refused` events
 * to the run's log while the run waits on the call, in the call's `foreach`
 * item or `parallel` branch, and drops the turn's other events, which a run
 * doesn't log yet.
 *
 * @param store - the run's store; `undefined` only for an executor without runs, which makes no run's call
 * @throws when there is no store
 */
export function refusalLog(
  store: Pick<RunStore, "append" | "events" | "snapshot"> | undefined,
  run: RunState,
  call: PendingCall,
  clock: Clock,
): TurnLog {
  if (store === undefined) {
    throw new Error(`Run ${run.runId}'s model call has no run store to log to.`);
  }
  const item = run.foreach?.running.find(
    (running) => "call" in running && running.call.callId === call.callId,
  );
  const branch = branchOfCall(run.parallel, call.callId);
  const log = new SerialRunLog(
    store,
    run.runId,
    { callId: call.callId },
    run.lastSeq,
    clock,
    item?.item ?? null,
    branch?.name ?? null,
  );
  return {
    append: (event) => (event.type === "tool.refused" ? log.append(event) : Promise.resolve()),
  };
}
