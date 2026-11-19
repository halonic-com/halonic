import type { SandboxStartCheck } from "@halonicjs/app";
import { type SandboxStart, useSandboxStart } from "@halonicjs/studio-feature-runs/api";
import type { ButtonUnavailable } from "@halonicjs/studio-kit";
import { type RefObject, useId, useRef } from "react";
import type { RoutinesHost, RoutineView } from "../api.ts";

/** What **Run now** and the can't-run Callout need (requirement `routines.page.cant-run`). */
export interface RunNowGate {
  readonly sandbox: SandboxStart;
  /** The `id` of the Callout's first line, which describes Run now while it is unavailable. */
  readonly cantRunId: string;
  /** Run now's `unavailable` while the sandbox can't start; `undefined` while it can. */
  readonly unavailable: ButtonUnavailable | undefined;
  /** Run now, which takes focus once **Check again** finds the sandbox ready. */
  readonly runNow: RefObject<HTMLButtonElement | null>;
}

/**
 * Whether the routine page's **Run now** can start a run: it needs the sandbox only when what the
 * routine starts runs a program (`startsProgram`), and only a check that refuses makes it
 * unavailable. The routine stays on either way (checklist 3.4).
 */
export function useRunNowGate(
  host: RoutinesHost,
  routine: RoutineView | undefined,
  check: SandboxStartCheck | undefined,
): RunNowGate {
  const sandbox = useSandboxStart(
    check,
    host.runNow !== undefined && routine?.startsProgram === true,
  );
  const cantRunId = useId();
  const runNow = useRef<HTMLButtonElement>(null);
  return {
    sandbox,
    cantRunId,
    unavailable: sandbox.refused === undefined ? undefined : { reason: cantRunId },
    runNow,
  };
}
