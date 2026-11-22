import { useToastStore } from "@halonicjs/studio-kit";
import { type ReactNode, useState } from "react";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { RunDialog, runDialogReason } from "./run-dialog.tsx";
import { runRoutineNow } from "./run-now.ts";
import type { RunNowGate } from "./run-now-gate.ts";

/** What the routine page's **Run now** needs, wherever it is drawn: the header or the phone's bar. */
export interface RunNow {
  /** Starts the run, or asks first in the run dialog when the routine isn't fully live. */
  readonly press: () => void;
  /** While the host still answers a start; a second press then starts nothing. */
  readonly starting: boolean;
  /** The run dialog while it asks, else `null`. */
  readonly dialog: ReactNode;
}

/**
 * **Run now** for the routine page (`routines.page.run-now`): a press starts the routine's target
 * and says what happened with a toast; on a routine that isn't fully live it asks first. Nothing
 * starts while the gate says the sandbox can't start, or while a start is still being answered.
 */
export function useRunNow(
  host: RoutinesHost,
  routine: RoutineView | undefined,
  gate: RunNowGate,
  openRun: ((runId: string) => void) | undefined,
): RunNow {
  const toasts = useToastStore();
  // A second press while the host still starts the first run would start a second run.
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState(false);
  const start = () => {
    if (routine === undefined || starting || gate.unavailable !== undefined) return;
    setAsking(false);
    setStarting(true);
    void runRoutineNow(host, toasts, routine, openRun).finally(() => setStarting(false));
  };
  const press = () => {
    if (routine === undefined || starting) return;
    if (runDialogReason(host, routine) === undefined) start();
    else setAsking(true);
  };
  const dialog =
    asking && routine !== undefined ? (
      <RunDialog host={host} routine={routine} onRun={start} onCancel={() => setAsking(false)} />
    ) : null;
  return { press, starting, dialog };
}
