// The run log of a run's model call (requirement `engine.run-turn-log`): the
// call writes its whole turn there, so the run's summary counts what its
// model calls cost and the budget sees it.

import type { Clock, RunStore } from "@halonicjs/ports";
import type { TurnEvent, TurnLog } from "../agent/turn-log.ts";
import { SerialRunLog } from "../harness/serial-run-log.ts";
import { branchOfCall } from "../kernel/run-branches.ts";
import type { PendingCall, RunState } from "../kernel/run-state.ts";

/**
 * A {@link TurnLog} that appends a run's model call's turn to the run's log
 * in a {@link RunStore}, with the turns of the subagents it hands tasks to.
 * Each event follows the run's last one, carries the call's `foreach` item
 * or `parallel` branch, and is stamped with the clock's time.
 *
 * The run's log can move on while the call runs: a person cancels it, or
 * another branch writes. The turn then writes after those events as long
 * as the run still waits on the call, and stops once it doesn't
 * ({@link SerialRunLog}).
 *
 * The events change nothing the kernel folds: a subagent's `agent.*`
 * events name their `parent`, and a `tool.result` only counts for a
 * connector call the run waits on, which it doesn't while a call runs.
 *
 * @example
 * const log = new LargeResultsTurnLog(new RunStoreTurnLog(runs, run, call, clock), blobs);
 */
export class RunStoreTurnLog implements TurnLog {
  readonly #log: SerialRunLog;

  /**
   * @param run - the run as it was when the call started, whose last event the turn's first follows
   * @param call - the model call the run waits on, which writes the turn
   */
  constructor(
    store: Pick<RunStore, "append" | "events" | "snapshot">,
    run: RunState,
    call: PendingCall,
    clock: Clock,
  ) {
    const item = run.foreach?.running.find(
      (running) => "call" in running && running.call.callId === call.callId,
    );
    this.#log = new SerialRunLog(
      store,
      run.runId,
      { callId: call.callId },
      run.lastSeq,
      clock,
      item?.item ?? null,
      branchOfCall(run.parallel, call.callId)?.name ?? null,
    );
  }

  /**
   * Appends one event after every event given before it.
   *
   * @throws when the run no longer waits on the call; the turn stops there
   */
  append(event: TurnEvent): Promise<void> {
    return this.#log.append(event);
  }
}
